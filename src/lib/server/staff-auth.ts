import { createServerFn } from "@tanstack/react-start";
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
    const ip = await clientIp();
    await assertAuthAllowed("master", ip);
    if (key.length !== 12) {
      await recordAuthFail("master", ip);
      throw new Error("Generalschlüssel ungültig.");
    }
    const ok = await masterKeyOk(key);
    if (!ok) {
      await recordAuthFail("master", ip);
      await auditAuth("auth.master_fail", ip);
      throw new Error("Generalschlüssel ungültig.");
    }
    await recordAuthOk("master", ip);
    await auditAuth("auth.master_ok", ip);
    const admin = await ensureAdminUser();
    return issueSession(admin.email, admin.id);
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
    if (!row?.totp_enabled || !row.totp_secret || row.status === "blocked" || !verifyTotp(row.totp_secret, totp)) {
      await recordAuthFail("totp", staffId);
      await auditAuth("auth.login_fail", await clientIp(), { id: staffId });
      throw new Error("Anmeldung fehlgeschlagen.");
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
