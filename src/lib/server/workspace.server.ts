import { SignJWT, importPKCS8 } from "jose";
import {
  GOOGLE_ADMIN_SCOPES,
  MAIL_DOMAIN,
  MAIL_PROVIDER,
  mailboxTypeFor,
  mailAddress,
  workspaceLocalPart,
  type MailboxType,
  type MailIdentityKind,
} from "@/lib/mail";
import { RENDER_OPTIONAL_ENV, RENDER_SECRET_ENV } from "@/lib/hosting";
import { nid } from "@/lib/utils";
import { flagsMap, sql } from "./helpers";

type Db = Awaited<ReturnType<typeof sql>>;

export type WorkspaceJobAction =
  | "create_user"
  | "suspend_user"
  | "unsuspend_user"
  | "ensure_shared"
  | "send_mail";

export type WorkspaceJobStatus = "queued" | "running" | "done" | "failed" | "skipped";

function env(key: string): string {
  return (process.env[key] ?? "").trim();
}

function privateKeyPem(): string {
  return env("GOOGLE_WORKSPACE_PRIVATE_KEY").replace(/\\n/g, "\n");
}

export function workspaceAdminReady() {
  return Boolean(
    env("GOOGLE_WORKSPACE_CLIENT_EMAIL") &&
      env("GOOGLE_WORKSPACE_PRIVATE_KEY") &&
      env("GOOGLE_WORKSPACE_ADMIN_EMAIL"),
  );
}

export function workspaceSmtpReady() {
  return false;
}

export function workspaceConnection() {
  const admin = workspaceAdminReady();
  return {
    host: "render" as const,
    mail_system: MAIL_PROVIDER,
    domain: MAIL_DOMAIN,
    mail_server_on_render: false,
    stores_mailbox_passwords: false,
    secrets_in: "render_env" as const,
    admin_sdk: admin,
    gmail_api: admin,
    connected: admin,
    admin_email: env("GOOGLE_WORKSPACE_ADMIN_EMAIL") || null,
    customer_id: env("GOOGLE_WORKSPACE_CUSTOMER_ID") || null,
    env_keys: [...RENDER_SECRET_ENV],
    optional_keys: [...RENDER_OPTIONAL_ENV],
    missing: RENDER_SECRET_ENV.filter((key) => !env(key)),
  };
}

let tokenCache = new Map<string, { token: string; exp: number }>();

export async function googleAccessToken(impersonate?: string): Promise<string | null> {
  const email = env("GOOGLE_WORKSPACE_CLIENT_EMAIL");
  const key = privateKeyPem();
  const sub = impersonate || env("GOOGLE_WORKSPACE_ADMIN_EMAIL");
  if (!email || !key || !sub) return null;
  const cacheKey = `${email}::${sub}`;
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.exp - 60 > now) return cached.token;
  try {
    const pk = await importPKCS8(key, "RS256");
    const jwt = await new SignJWT({ scope: GOOGLE_ADMIN_SCOPES.join(" ") })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(email)
      .setSubject(sub)
      .setAudience("https://oauth2.googleapis.com/token")
      .setIssuedAt()
      .setExpirationTime("50m")
      .sign(pk);
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
    const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
    if (!res.ok || !json.access_token) return null;
    tokenCache.set(cacheKey, {
      token: json.access_token,
      exp: now + (json.expires_in ?? 3000),
    });
    return json.access_token;
  } catch {
    return null;
  }
}

async function directoryFetch(path: string, init: RequestInit & { impersonate?: string } = {}) {
  const token = await googleAccessToken(init.impersonate);
  if (!token) throw new Error("Google Workspace Admin SDK ist nicht verbunden.");
  const res = await fetch(`https://admin.googleapis.com/admin/directory/v1${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { error: text.slice(0, 200) };
    }
  }
  if (!res.ok) {
    const msg =
      json && typeof json === "object" && "error" in json
        ? JSON.stringify((json as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

export async function enqueueWorkspaceJob(
  db: Db,
  input: {
    action: WorkspaceJobAction;
    localPart: string;
    displayName?: string;
    profileUserId?: string | null;
    payload?: unknown;
  },
) {
  const id = nid();
  await db`
    insert into workspace_jobs (id, action, local_part, display_name, profile_user_id, payload, status)
    values (
      ${id},
      ${input.action},
      ${input.localPart},
      ${input.displayName ?? null},
      ${input.profileUserId ?? null},
      ${JSON.stringify(input.payload ?? {})}::jsonb,
      ${"queued"}
    )
  `;
  return id;
}

export async function ensureWorkspaceIdentity(
  db: Db,
  input: {
    first: string;
    last: string;
    profileUserId?: string | null;
    kind?: MailIdentityKind;
    purpose?: string;
    mailboxType?: MailboxType;
  },
) {
  const local = workspaceLocalPart(input.first, input.last);
  if (!local) return null;
  const display = `${input.first} ${input.last}`.trim();
  const kind: MailIdentityKind = input.kind ?? "personal";
  const mailboxType = input.mailboxType ?? mailboxTypeFor(kind, local);
  await db`
    insert into mail_identities (
      id, domain_id, local_part, display_name, kind, purpose, mailbox_type, profile_user_id, workspace_status
    )
    values (
      ${`mi-${local}`},
      ${"mail-e1"},
      ${local},
      ${display},
      ${kind},
      ${input.purpose ?? "Mitarbeiter-Postfach vorname.nachname"},
      ${mailboxType},
      ${input.profileUserId ?? null},
      ${"pending"}
    )
    on conflict (domain_id, local_part) do update set
      display_name = excluded.display_name,
      profile_user_id = coalesce(excluded.profile_user_id, mail_identities.profile_user_id),
      purpose = excluded.purpose
  `;
  return local;
}

export async function provisionUserMailbox(
  db: Db,
  input: { first: string; last: string; profileUserId: string; orgUnit?: string },
) {
  const local = await ensureWorkspaceIdentity(db, {
    first: input.first,
    last: input.last,
    profileUserId: input.profileUserId,
  });
  if (!local) return;
  await db`
    update mail_identities
    set workspace_status = 'queued', active = true
    where domain_id = 'mail-e1' and local_part = ${local}
  `;
  await enqueueWorkspaceJob(db, {
    action: "create_user",
    localPart: local,
    displayName: `${input.first} ${input.last}`.trim(),
    profileUserId: input.profileUserId,
    payload: { orgUnit: input.orgUnit ?? "/Vertrieb" },
  });
}

export async function suspendUserMailbox(db: Db, profileUserId: string, first: string, last: string) {
  const local = workspaceLocalPart(first, last);
  if (!local) return;
  await db`
    update mail_identities
    set workspace_status = 'queued', active = false
    where domain_id = 'mail-e1' and local_part = ${local}
  `;
  await enqueueWorkspaceJob(db, {
    action: "suspend_user",
    localPart: local,
    displayName: `${first} ${last}`.trim(),
    profileUserId,
  });
}

export async function unsuspendUserMailbox(db: Db, profileUserId: string, first: string, last: string) {
  const local = workspaceLocalPart(first, last);
  if (!local) return;
  await db`
    update mail_identities
    set workspace_status = 'queued', active = true
    where domain_id = 'mail-e1' and local_part = ${local}
  `;
  await enqueueWorkspaceJob(db, {
    action: "unsuspend_user",
    localPart: local,
    displayName: `${first} ${last}`.trim(),
    profileUserId,
  });
}

function asPayload(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object") return {};
  return v as Record<string, unknown>;
}

async function runCreateUser(local: string, displayName: string, orgUnit: string) {
  const primary = mailAddress(local);
  const [given, ...rest] = displayName.split(/\s+/);
  // One-shot bootstrap for Directory API. Never logged, never written to our DB.
  // The employee sets their own password in Workspace at first login.
  const bootstrap = `${crypto.randomUUID()}Aa1!`;
  await directoryFetch("/users", {
    method: "POST",
    body: JSON.stringify({
      primaryEmail: primary,
      name: { givenName: given || local, familyName: rest.join(" ") || "E1" },
      password: bootstrap,
      changePasswordAtNextLogin: true,
      orgUnitPath: orgUnit || "/Vertrieb",
    }),
  });
}

async function runSuspend(local: string, suspended: boolean) {
  await directoryFetch(`/users/${encodeURIComponent(mailAddress(local))}`, {
    method: "PUT",
    body: JSON.stringify({ suspended }),
  });
}

async function runEnsureShared(local: string, displayName: string) {
  const email = mailAddress(local);
  try {
    await directoryFetch(`/groups/${encodeURIComponent(email)}`);
  } catch {
    await directoryFetch("/groups", {
      method: "POST",
      body: JSON.stringify({
        email,
        name: displayName,
        description: `E1 Shared-Postfach ${email}`,
      }),
    });
  }
}

async function runSendMail(payload: Record<string, unknown>) {
  const requestedFrom = String(payload.from ?? `business@${MAIL_DOMAIN}`);
  const to = String(payload.to ?? "");
  const subject = String(payload.subject ?? "E1 Direktvertrieb");
  const text = String(payload.text ?? "");
  if (!to) throw new Error("Kein Empfänger.");
  const admin = env("GOOGLE_WORKSPACE_ADMIN_EMAIL") || `business@${MAIL_DOMAIN}`;
  const local = requestedFrom.split("@")[0] || "info";
  const shared = ["info", "bewerbung", "business", "system", "dmarc"].includes(local);
  const impersonate = shared ? admin : requestedFrom;
  const token = await googleAccessToken(impersonate);
  if (!token) throw new Error("Gmail API nicht verbunden.");
  const raw = [
    `From: E1 Direktvertrieb <${impersonate}>`,
    `To: ${to}`,
    `Reply-To: ${requestedFrom}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    text,
  ].join("\r\n");
  const encoded = Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/send`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ raw: encoded }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body.slice(0, 240) || `Gmail HTTP ${res.status}`);
  }
}

export async function processWorkspaceJobs(db: Db, limit = 20) {
  const flags = await flagsMap(db);
  const jobs = await db<Record<string, unknown>>`
    select * from workspace_jobs
    where status = 'queued'
    order by created_at asc
    limit ${limit}
  `;
  const results: Array<{ id: string; status: WorkspaceJobStatus; error?: string }> = [];
  for (const job of jobs) {
    const id = String(job.id);
    const action = String(job.action) as WorkspaceJobAction;
    const local = String(job.local_part);
    const display = String(job.display_name ?? local);
    const payload = asPayload(job.payload);
    await db`update workspace_jobs set status = 'running', attempts = attempts + 1 where id = ${id}`;
    try {
      const needsAdmin = action === "create_user" || action === "suspend_user" || action === "unsuspend_user" || action === "ensure_shared";
      const needsMail = action === "send_mail";
      if (needsAdmin && !flags.workspace_admin_sdk) {
        await db`
          update workspace_jobs set status = 'skipped', error = 'Feature-Flag workspace_admin_sdk ist aus. Job bleibt vorbereitet.', processed_at = now()
          where id = ${id}
        `;
        results.push({ id, status: "skipped", error: "Flag aus" });
        continue;
      }
      if (needsMail && !flags.workspace_gmail_api && !workspaceAdminReady()) {
        await db`
          update workspace_jobs set status = 'skipped', error = 'Gmail API Feature-Flag ist aus. Kein Mailserver auf Render.', processed_at = now()
          where id = ${id}
        `;
        results.push({ id, status: "skipped" });
        continue;
      }
      if ((needsAdmin || (needsMail && flags.workspace_gmail_api)) && !workspaceAdminReady()) {
        await db`
          update workspace_jobs
          set status = 'queued', error = 'Keine Workspace-Zugangsdaten. Service-Account setzen, dann erneut ausführen.', processed_at = now()
          where id = ${id}
        `;
        results.push({ id, status: "queued", error: "keine Zugangsdaten" });
        continue;
      }
      if (action === "create_user") {
        await runCreateUser(local, display, String(payload.orgUnit ?? "/Vertrieb"));
        await db`
          update mail_identities set workspace_status = 'provisioned', workspace_user_id = ${mailAddress(local)}, active = true
          where domain_id = 'mail-e1' and local_part = ${local}
        `;
      } else if (action === "suspend_user") {
        await runSuspend(local, true);
        await db`
          update mail_identities set workspace_status = 'suspended', active = false
          where domain_id = 'mail-e1' and local_part = ${local}
        `;
      } else if (action === "unsuspend_user") {
        await runSuspend(local, false);
        await db`
          update mail_identities set workspace_status = 'provisioned', active = true
          where domain_id = 'mail-e1' and local_part = ${local}
        `;
      } else if (action === "ensure_shared") {
        await runEnsureShared(local, display);
        await db`
          update mail_identities set workspace_status = 'shared', active = true
          where domain_id = 'mail-e1' and local_part = ${local}
        `;
      } else if (action === "send_mail") {
        await runSendMail(payload);
      }
      await db`
        update workspace_jobs set status = 'done', error = null, processed_at = now() where id = ${id}
      `;
      results.push({ id, status: "done" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db`
        update workspace_jobs set status = 'failed', error = ${message}, processed_at = now() where id = ${id}
      `;
      if (action === "create_user" || action === "suspend_user" || action === "unsuspend_user") {
        await db`
          update mail_identities set workspace_status = 'failed'
          where domain_id = 'mail-e1' and local_part = ${local}
        `;
      }
      results.push({ id, status: "failed", error: message });
    }
  }
  await db`update workspace_config set last_sync_at = now() where id = 'ws-e1'`;
  return results;
}

export async function queuePortalMail(
  db: Db,
  input: { from: string; to?: string; subject: string; text: string; purpose: string },
) {
  const to = input.to ?? input.from;
  if (workspaceAdminReady()) {
    await runSendMail({ from: input.from, to, subject: input.subject, text: input.text });
    return;
  }
  await enqueueWorkspaceJob(db, {
    action: "send_mail",
    localPart: input.from.split("@")[0] ?? "system",
    displayName: input.purpose,
    payload: { from: input.from, to, subject: input.subject, text: input.text, purpose: input.purpose },
  });
}
