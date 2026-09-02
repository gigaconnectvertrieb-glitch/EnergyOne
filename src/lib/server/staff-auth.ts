import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { auth } from "@/lib/auth/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { generateTotpSecret, verifyTotp } from "@/lib/totp.server";
import { can, type Role, ROLES } from "@/lib/e1";
import { nid } from "@/lib/utils";
import { requireProfile, sql } from "./helpers";
import {
  assertAuthAllowed,
  auditAuth,
  clientIp,
  recordAuthFail,
  recordAuthOk,
  sha256,
} from "./auth-guard.server";

function fiveDigit() {
  return String(10000 + Math.floor(Math.random() * 90000));
}

function staffIdOf(v: string) {
  return v.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "");
}

function digitsOnly(v: string, n: number) {
  return v.replace(/\D+/g, "").slice(0, n);
}

async function masterKeyOk(key: string) {
  const hashed = sha256(key);
  const fromEnv = process.env.E1_ADMIN_MASTER_KEY?.replace(/\D+/g, "");
  if (fromEnv && fromEnv.length === 12) {
    return safeEqual(hashed, sha256(fromEnv));
  }
  const db = await sql();
  const [row] = await db<{ value: string }>`select value from settings where key = 'admin_master_key'`;
  let stored = row?.value || "";
  if (!stored.startsWith("sha256:")) {
    const plain = (stored.replace(/\D+/g, "") || "482917365018");
    stored = `sha256:${sha256(plain)}`;
    await db`
      insert into settings (key, value) values ('admin_master_key', ${stored})
      on conflict (key) do update set value = excluded.value
    `;
  }
  return safeEqual(hashed, stored.slice("sha256:".length));
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function incomingHeaders() {
  const origin =
    process.env.BETTER_AUTH_URL || process.env.RENDER_EXTERNAL_URL || "https://e1direktvertrieb.de";
  let headers = new Headers();
  try {
    const req = getRequest();
    if (req?.headers) headers = new Headers(req.headers);
  } catch {
    /* nitro bundle */
  }
  if (!headers.get("origin")) headers.set("origin", origin);
  if (!headers.get("host")) {
    try {
      headers.set("host", new URL(origin).host);
    } catch {
      headers.set("host", "e1direktvertrieb.de");
    }
  }
  return headers;
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
  const result = await auth.api.signInEmail({
    body: { email, password },
    headers: incomingHeaders(),
  });
  if (!result || (result as { error?: unknown }).error) {
    throw new Error("Anmeldung fehlgeschlagen.");
  }
  return { ok: true as const, email };
}

const FOUNDERS: Record<string, { first: string; last: string; email: string }> = {
  orhan: { first: "Orhan", last: "Salo", email: "orhan.salo@e1direktvertrieb.de" },
  luca: { first: "Luca-Marco", last: "Marrancone", email: "luca.marrancone@e1direktvertrieb.de" },
};

async function ensureFounder(staffId: string) {
  const spec = FOUNDERS[staffId];
  if (!spec) throw new Error("Kein Geschäftsführer-Zugang.");
  const db = await sql();
  const [byStaff] = await db<{ user_id: string; email: string | null }>`
    select p.user_id, u.email
    from profiles p
    left join "user" u on u.id = p.user_id
    where lower(p.staff_id) = ${staffId}
  `;
  if (byStaff) {
    await db`
      update profiles
      set role = 'super_admin', status = 'active', onboarding_status = 'aktiv',
          first_name = ${spec.first}, last_name = ${spec.last}, staff_id = ${staffId},
          commission_stufe = 13
      where user_id = ${byStaff.user_id}
    `;
    return { id: byStaff.user_id, email: byStaff.email || spec.email };
  }
  const [byMail] = await db<{ id: string }>`select id from "user" where lower(email) = ${spec.email}`;
  if (byMail) {
    await db`
      insert into profiles (user_id, first_name, last_name, role, status, onboarding_status, region_id, staff_id, commission_stufe)
      values (${byMail.id}, ${spec.first}, ${spec.last}, 'super_admin', 'active', 'aktiv', 'reg-sued', ${staffId}, 13)
      on conflict (user_id) do update set
        role = 'super_admin', status = 'active', staff_id = ${staffId},
        first_name = ${spec.first}, last_name = ${spec.last}, commission_stufe = 13
    `;
    return { id: byMail.id, email: spec.email };
  }
  const ctx = await auth.$context;
  const created = await ctx.internalAdapter.createUser({
    email: spec.email,
    name: `${spec.first} ${spec.last}`,
    emailVerified: true,
  });
  await db`
    insert into profiles (user_id, first_name, last_name, role, status, onboarding_status, region_id, staff_id, commission_stufe)
    values (${created.id}, ${spec.first}, ${spec.last}, 'super_admin', 'active', 'aktiv', 'reg-sued', ${staffId}, 13)
    on conflict (user_id) do update set role = 'super_admin', status = 'active', staff_id = ${staffId}, commission_stufe = 13
  `;
  return { id: created.id, email: spec.email };
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
  .validator((d: { staffId: string; key: string }) => d)
  .handler(async ({ data }) => {
    const staffId = staffIdOf(data.staffId);
    const key = digitsOnly(data.key, 12);
    const ip = await clientIp();
    await assertAuthAllowed("master", ip);
    if (!staffId || key.length !== 12) {
      await recordAuthFail("master", ip);
      throw new Error("Benutzername oder Generalschlüssel ungültig.");
    }
    const hashed = sha256(key);
    if (FOUNDERS[staffId] && (await masterKeyOk(key))) {
      await recordAuthOk("master", ip);
      await auditAuth("auth.master_ok", ip, { id: staffId });
      const admin = await ensureFounder(staffId);
      return issueSession(admin.email, admin.id);
    }
    const db = await sql();
    const [row] = await db<{ user_id: string; email: string | null; staff_master_hash: string | null }>`
      select p.user_id, p.staff_master_hash, u.email
      from profiles p
      left join "user" u on u.id = p.user_id
      where lower(p.staff_id) = ${staffId}
      limit 1
    `;
    if (!row?.staff_master_hash || !safeEqual(hashed, row.staff_master_hash)) {
      await recordAuthFail("master", ip);
      await auditAuth("auth.master_fail", ip, { id: staffId });
      throw new Error("Benutzername oder Generalschlüssel ungültig.");
    }
    await recordAuthOk("master", ip);
    await auditAuth("auth.staff_master_ok", ip, { id: staffId });
    return issueSession(row.email || `${staffId}@e1direktvertrieb.de`, row.user_id);
  });

export const issueStaffMaster = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { userId: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "users.manage")) throw new Error("Kein Zugriff.");
    const key = String(100000000000 + Math.floor(Math.random() * 899999999999));
    await db`update profiles set staff_master_hash = ${sha256(key)}, updated_at = now() where user_id = ${data.userId}`;
    await auditAuth("auth.staff_master_issue", await clientIp(), { target: data.userId });
    return { key };
  });

export const startInvite = createServerFn({ method: "POST" })
  .validator((d: { staffId: string; code: string }) => d)
  .handler(async ({ data }) => {
    const staffId = staffIdOf(data.staffId);
    const code = digitsOnly(data.code, 5);
    await assertAuthAllowed("invite", staffId || "x");
    if (!staffId || code.length !== 5) {
      await recordAuthFail("invite", staffId || "x");
      throw new Error("Mitarbeiter-ID oder Code ungültig.");
    }
    const db = await sql();
    const [row] = await db<{
      user_id: string;
      first_name: string;
      last_name: string;
      totp_enabled: boolean;
      email: string | null;
      staff_id: string | null;
    }>`
      select p.user_id, p.first_name, p.last_name, p.totp_enabled, p.staff_id, u.email
      from profiles p
      left join "user" u on u.id = p.user_id
      where p.invite_code = ${code}
    `;
    if (!row || staffIdOf(row.staff_id || "") !== staffId) {
      await recordAuthFail("invite", staffId);
      throw new Error("Mitarbeiter-ID oder Code ungültig.");
    }
    if (row.totp_enabled) throw new Error("Schon registriert. Bitte anmelden.");
    await recordAuthOk("invite", staffId);
    const secret = generateTotpSecret();
    await db`update profiles set totp_secret = ${secret} where user_id = ${row.user_id}`;
    const email = row.email || `${staffId}@intern.e1direktvertrieb.de`;
    const uri = `otpauth://totp/E1%20Direktvertrieb:${encodeURIComponent(staffId)}?secret=${secret}&issuer=E1%20Direktvertrieb&digits=6&period=30`;
    return {
      firstName: row.first_name,
      lastName: row.last_name,
      staffId,
      email,
      secret,
      uri,
    };
  });

export const finishInvite = createServerFn({ method: "POST" })
  .validator((d: { staffId: string; code: string; totp: string }) => d)
  .handler(async ({ data }) => {
    const staffId = staffIdOf(data.staffId);
    const code = digitsOnly(data.code, 5);
    const totp = digitsOnly(data.totp, 6);
    await assertAuthAllowed("invite-totp", staffId || "x");
    const db = await sql();
    const [row] = await db<{
      user_id: string;
      totp_secret: string | null;
      totp_enabled: boolean;
      email: string | null;
      staff_id: string | null;
    }>`
      select p.user_id, p.totp_secret, p.totp_enabled, p.staff_id, u.email
      from profiles p
      left join "user" u on u.id = p.user_id
      where p.invite_code = ${code}
    `;
    if (!row?.totp_secret || staffIdOf(row.staff_id || "") !== staffId || !verifyTotp(row.totp_secret, totp)) {
      await recordAuthFail("invite-totp", staffId || "x");
      throw new Error("Registrierung fehlgeschlagen.");
    }
    await db`
      update profiles
      set totp_enabled = true, totp_enrolled_at = now(), status = 'active', onboarding_status = 'aktiv'
      where user_id = ${row.user_id}
    `;
    await recordAuthOk("invite-totp", staffId);
    await auditAuth("auth.register_ok", await clientIp(), { id: staffId });
    const email = row.email || `${staffId}@intern.e1direktvertrieb.de`;
    return issueSession(email, row.user_id);
  });

export const loginTotp = createServerFn({ method: "POST" })
  .validator((d: { staffId: string; totp: string }) => d)
  .handler(async ({ data }) => {
    const staffId = staffIdOf(data.staffId);
    const totp = digitsOnly(data.totp, 6);
    await assertAuthAllowed("totp", staffId || "x");
    if (!staffId || totp.length !== 6) {
      await recordAuthFail("totp", staffId || "x");
      throw new Error("Anmeldung fehlgeschlagen.");
    }
    const db = await sql();
    const [row] = await db<{
      user_id: string;
      totp_secret: string | null;
      totp_enabled: boolean;
      email: string | null;
      status: string;
    }>`
      select p.user_id, p.totp_secret, p.totp_enabled, p.status, u.email
      from profiles p
      left join "user" u on u.id = p.user_id
      where lower(p.staff_id) = ${staffId}
    `;
    if (!row?.totp_enabled || !row.totp_secret || !verifyTotp(row.totp_secret, totp)) {
      await recordAuthFail("totp", staffId);
      await auditAuth("auth.login_fail", await clientIp(), { id: staffId });
      throw new Error("Anmeldung fehlgeschlagen.");
    }
    if (row.status !== "active") {
      await recordAuthFail("totp", staffId);
      throw new Error("Zugang deaktiviert. Bitte die Geschäftsführung kontaktieren.");
    }
    await recordAuthOk("totp", staffId);
    await auditAuth("auth.login_ok", await clientIp(), { id: staffId });
    const email = row.email || `${staffId}@intern.e1direktvertrieb.de`;
    return issueSession(email, row.user_id);
  });

export const createStaff = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { firstName: string; lastName: string; staffId: string; email?: string; role?: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "users.manage")) throw new Error("Keine Berechtigung.");
    const first = data.firstName.trim();
    const last = data.lastName.trim();
    const staffId = staffIdOf(data.staffId);
    const role = (ROLES as readonly string[]).includes(data.role || "")
      ? (data.role as Role)
      : "vertrieb";
    if (!first || !last) throw new Error("Name fehlt.");
    if (!staffId) throw new Error("Mitarbeiter-ID fehlt.");
    const [idTaken] = await db`select user_id from profiles where lower(staff_id) = ${staffId}`;
    if (idTaken) throw new Error("Diese Mitarbeiter-ID gibt es schon.");
    const email = (data.email?.trim() || `${staffId}@intern.e1direktvertrieb.de`).toLowerCase();
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
      insert into profiles (user_id, first_name, last_name, role, status, onboarding_status, invite_code, staff_id)
      values (${created.id}, ${first}, ${last}, ${role}, 'pending', 'neu', ${code}, ${staffId})
    `;
    return { userId: created.id, inviteCode: code, staffId, email };
  });

async function wipeAuth(db: Awaited<ReturnType<typeof sql>>, userId: string) {
  await db`delete from session where "userId" = ${userId}`.catch(async () => {
    await db`delete from "session" where user_id = ${userId}`.catch(() => {});
  });
  await db`delete from account where "userId" = ${userId}`.catch(() => {});
  await db`delete from "user" where id = ${userId}`.catch(() => {});
}

export const deleteStaff = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { userId: string; purgeContracts?: boolean }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "users.manage")) throw new Error("Keine Berechtigung.");
    if (data.userId === context.userId) throw new Error("Sie können sich nicht selbst löschen.");
    const [row] = await db<Record<string, unknown>>`
      select user_id, first_name, last_name, role, staff_id, status from profiles where user_id = ${data.userId}
    `;
    if (!row) throw new Error("Mitarbeiter nicht gefunden.");
    if (String(row.role) === "super_admin") throw new Error("Geschäftsführung kann nicht gelöscht werden.");
    const staffId = String(row.staff_id || "").toLowerCase();
    if (staffId === "orhan" || staffId === "luca") throw new Error("Gründer-Zugang bleibt.");
    const [cnt] = await db<{ n: number }>`
      select count(*)::int as n from contracts where user_id = ${data.userId}
    `;
    const n = Number(cnt?.n || 0);
    const purge = Boolean(data.purgeContracts) || n === 0;

    const extra = [
      db`delete from profile_flags where user_id = ${data.userId}`,
      db`delete from knowledge_progress where user_id = ${data.userId}`,
      db`delete from notifications where user_id = ${data.userId}`,
      db`delete from push_subscriptions where user_id = ${data.userId}`,
      db`delete from goal_nudges where user_id = ${data.userId}`,
      db`delete from tax_expenses where user_id = ${data.userId}`,
      db`delete from tax_settings where user_id = ${data.userId}`,
      db`delete from territory_members where user_id = ${data.userId}`,
      db`delete from field_visits where user_id = ${data.userId}`,
      db`delete from work_days where user_id = ${data.userId}`,
      db`delete from quality_alerts where user_id = ${data.userId}`,
    ];
    for (const q of extra) {
      try {
        await q;
      } catch {
        /* Tabelle kann fehlen */
      }
    }
    await db`update territories set user_id = null where user_id = ${data.userId}`.catch(() => {});

    if (purge && n > 0) {
      await db`delete from payout_items where user_id = ${data.userId}`.catch(() => {});
      await db`delete from commissions where user_id = ${data.userId}`.catch(() => {});
      await db`delete from contract_status_history where contract_id in (select id from contracts where user_id = ${data.userId})`.catch(() => {});
      await db`delete from documents where contract_id in (select id from contracts where user_id = ${data.userId})`.catch(() => {});
      await db`delete from contracts where user_id = ${data.userId}`.catch(() => {});
    }

    if (purge) {
      await db`delete from profiles where user_id = ${data.userId}`;
      await wipeAuth(db, data.userId);
      return { ok: true, purged: true, contracts: n };
    }

    await db`
      update profiles
      set status = 'deleted', staff_id = null, totp_secret = null, totp_enabled = false, invite_code = null
      where user_id = ${data.userId}
    `;
    await wipeAuth(db, data.userId);
    return { ok: true, purged: false, contracts: n };
  });
