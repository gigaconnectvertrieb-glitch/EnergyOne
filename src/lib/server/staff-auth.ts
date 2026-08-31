import { createServerFn } from "@tanstack/react-start";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { auth } from "@/lib/auth/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { generateTotpSecret, verifyTotp } from "@/lib/totp.server";
import { can, type Role, ROLES } from "@/lib/e1";
import { nid } from "@/lib/utils";
import { requireProfile, sql } from "./helpers";

function fiveDigit() {
  return String(10000 + Math.floor(Math.random() * 90000));
}

function digitsOnly(v: string, n: number) {
  return v.replace(/\D+/g, "").slice(0, n);
}

async function masterKey() {
  const fromEnv = process.env.E1_ADMIN_MASTER_KEY?.replace(/\D+/g, "");
  if (fromEnv && fromEnv.length === 12) return fromEnv;
  const db = await sql();
  const [row] = await db<{ value: string }>`select value from settings where key = 'admin_master_key'`;
  return (row?.value || "482917365018").replace(/\D+/g, "");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

async function issueSession(email: string, userId: string) {
  const ctx = await auth.$context;
  const password = `${randomBytes(24).toString("base64url")}Aa1!`;
  const hash = await ctx.password.hash(password);
  const db = await sql();
  const [acc] = await db<{ id: string }>`
    select id from account where "userId" = ${userId} and "providerId" = 'credential'
  `;
  if (acc) {
    await db`update account set password = ${hash}, "updatedAt" = now() where id = ${acc.id}`;
  } else {
    await db`
      insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
      values (${nid()}, ${userId}, 'credential', ${userId}, ${hash}, now(), now())
    `;
  }
  const { getRequest } = await import("@tanstack/react-start/server");
  const req = getRequest();
  const headers = new Headers(req.headers);
  const origin =
    process.env.BETTER_AUTH_URL || process.env.RENDER_EXTERNAL_URL || "https://e1direktvertrieb.de";
  if (!headers.get("origin")) headers.set("origin", origin);
  const result = await auth.api.signInEmail({
    body: { email, password },
    headers,
  });
  if (!result || (result as { error?: unknown }).error) {
    throw new Error("Anmeldung fehlgeschlagen.");
  }
  return { ok: true as const, email };
}

async function ensureAdminUser() {
  const db = await sql();
  const email = "business@e1direktvertrieb.de";
  const [existing] = await db<{ id: string }>`select id from "user" where email = ${email}`;
  if (existing) {
    const [p] = await db`select user_id from profiles where user_id = ${existing.id}`;
    if (!p) {
      await db`
        insert into profiles (user_id, first_name, last_name, role, status, onboarding_status)
        values (${existing.id}, 'Orhan', 'Salo', 'super_admin', 'active', 'aktiv')
      `;
    } else {
      await db`update profiles set role = 'super_admin', status = 'active' where user_id = ${existing.id}`;
    }
    return { id: existing.id, email };
  }
  const ctx = await auth.$context;
  const created = await ctx.internalAdapter.createUser({
    email,
    name: "Orhan Salo",
    emailVerified: true,
  });
  const adminId = created.id;
  await db`
    insert into profiles (user_id, first_name, last_name, role, status, onboarding_status, region_id)
    values (${adminId}, 'Orhan', 'Salo', 'super_admin', 'active', 'aktiv', 'reg-sued')
    on conflict (user_id) do update set role = 'super_admin', status = 'active'
  `;
  return { id: adminId, email };
}

export async function uniqueInviteCode() {
  const db = await sql();
  for (let i = 0; i < 30; i += 1) {
    const code = fiveDigit();
    const [hit] = await db`select user_id from profiles where invite_code = ${code}`;
    if (!hit) return code;
  }
  throw new Error("Kein freier Schlüssel. Bitte erneut versuchen.");
}

export const loginMaster = createServerFn({ method: "POST" })
  .validator((d: { key: string }) => d)
  .handler(async ({ data }) => {
    const key = digitsOnly(data.key, 12);
    if (key.length !== 12) throw new Error("Der Generalschlüssel hat 12 Ziffern.");
    const expected = await masterKey();
    if (!safeEqual(key, expected)) throw new Error("Generalschlüssel ungültig.");
    const admin = await ensureAdminUser();
    return issueSession(admin.email, admin.id);
  });

export const startInvite = createServerFn({ method: "POST" })
  .validator((d: { code: string }) => d)
  .handler(async ({ data }) => {
    const code = digitsOnly(data.code, 5);
    if (code.length !== 5) throw new Error("Der Mitarbeiter-Schlüssel hat 5 Ziffern.");
    const db = await sql();
    const [row] = await db<{
      user_id: string;
      first_name: string;
      last_name: string;
      totp_enabled: boolean;
      email: string | null;
    }>`
      select p.user_id, p.first_name, p.last_name, p.totp_enabled, u.email
      from profiles p
      left join "user" u on u.id = p.user_id
      where p.invite_code = ${code}
    `;
    if (!row) throw new Error("Schlüssel unbekannt. Bitte bei der Leitung nachfragen.");
    if (row.totp_enabled) throw new Error("Dieser Schlüssel ist schon benutzt. Bitte anmelden.");
    const secret = generateTotpSecret();
    await db`update profiles set totp_secret = ${secret} where user_id = ${row.user_id}`;
    const email = row.email || `${row.user_id}@e1direktvertrieb.de`;
    const uri = `otpauth://totp/E1%20Direktvertrieb:${encodeURIComponent(email)}?secret=${secret}&issuer=E1%20Direktvertrieb&digits=6&period=30`;
    return {
      firstName: row.first_name,
      lastName: row.last_name,
      email,
      secret,
      uri,
    };
  });

export const finishInvite = createServerFn({ method: "POST" })
  .validator((d: { code: string; totp: string }) => d)
  .handler(async ({ data }) => {
    const code = digitsOnly(data.code, 5);
    const totp = digitsOnly(data.totp, 6);
    const db = await sql();
    const [row] = await db<{
      user_id: string;
      totp_secret: string | null;
      totp_enabled: boolean;
      email: string | null;
    }>`
      select p.user_id, p.totp_secret, p.totp_enabled, u.email
      from profiles p
      left join "user" u on u.id = p.user_id
      where p.invite_code = ${code}
    `;
    if (!row?.totp_secret) throw new Error("Bitte zuerst den Schlüssel prüfen.");
    if (!verifyTotp(row.totp_secret, totp)) throw new Error("Authenticator-Code ungültig.");
    await db`
      update profiles
      set totp_enabled = true, totp_enrolled_at = now(), status = 'active', onboarding_status = 'aktiv'
      where user_id = ${row.user_id}
    `;
    const email = row.email || `${row.user_id}@e1direktvertrieb.de`;
    return issueSession(email, row.user_id);
  });

export const loginTotp = createServerFn({ method: "POST" })
  .validator((d: { email: string; totp: string }) => d)
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const totp = digitsOnly(data.totp, 6);
    if (!email.includes("@")) throw new Error("E-Mail fehlt.");
    if (totp.length !== 6) throw new Error("Authenticator-Code hat 6 Ziffern.");
    const db = await sql();
    const [row] = await db<{
      user_id: string;
      totp_secret: string | null;
      totp_enabled: boolean;
      role: string;
    }>`
      select p.user_id, p.totp_secret, p.totp_enabled, p.role
      from "user" u
      join profiles p on p.user_id = u.id
      where lower(u.email) = ${email}
    `;
    if (!row) throw new Error("Kein Zugang zu dieser E-Mail.");
    if (!row.totp_enabled || !row.totp_secret) {
      throw new Error("Noch nicht registriert. Bitte zuerst den 5-stelligen Schlüssel nutzen.");
    }
    if (!verifyTotp(row.totp_secret, totp)) throw new Error("Authenticator-Code ungültig.");
    return issueSession(email, row.user_id);
  });

export const createStaff = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { firstName: string; lastName: string; email: string; role?: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "users.manage")) throw new Error("Keine Berechtigung.");
    const first = data.firstName.trim();
    const last = data.lastName.trim();
    const email = data.email.trim().toLowerCase();
    const role = (ROLES as readonly string[]).includes(data.role || "")
      ? (data.role as Role)
      : "vertrieb";
    if (!first || !last) throw new Error("Name fehlt.");
    if (!email.includes("@")) throw new Error("E-Mail fehlt.");
    const [taken] = await db`select id from "user" where lower(email) = ${email}`;
    if (taken) throw new Error("Diese E-Mail ist schon angelegt.");
    const ctx = await auth.$context;
    const created = await ctx.internalAdapter.createUser({
      email,
      name: `${first} ${last}`,
      emailVerified: true,
    });
    const code = await uniqueInviteCode();
    await db`
      insert into profiles (user_id, first_name, last_name, role, status, onboarding_status, invite_code)
      values (${created.id}, ${first}, ${last}, ${role}, 'pending', 'neu', ${code})
    `;
    return { userId: created.id, inviteCode: code, email };
  });
