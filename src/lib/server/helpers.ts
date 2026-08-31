import { getSql, type Sql } from "@/lib/db";
import { can, type Profile, type Role, ROLES } from "@/lib/e1";
import { allFlagsOn, DEFAULT_STAFF_FLAGS } from "@/lib/features";
import { asStr, nid, num } from "@/lib/utils";

export async function sql() {
  return getSql();
}

export function asRole(v: unknown): Role {
  const s = asStr(v);
  return (ROLES as readonly string[]).includes(s) ? (s as Role) : "vertrieb";
}

export function mapProfile(r: Record<string, unknown>): Profile {
  return {
    user_id: asStr(r.user_id),
    first_name: asStr(r.first_name),
    last_name: asStr(r.last_name),
    role: asRole(r.role),
    user_type: asStr(r.user_type) || "angestellt",
    region_id: r.region_id ? asStr(r.region_id) : null,
    region_name: r.region_name ? asStr(r.region_name) : null,
    supervisor_id: r.supervisor_id ? asStr(r.supervisor_id) : null,
    status: asStr(r.status) || "pending",
    phone: r.phone ? asStr(r.phone) : null,
    monthly_target: num(r.monthly_target),
    totp_enabled: Boolean(r.totp_enabled),
    commission_stufe: ([1, 2, 3].includes(Number(r.commission_stufe)) ? Number(r.commission_stufe) : 1) as 1 | 2 | 3,
    onboarding_status: asStr(r.onboarding_status) || "neu",
    notes: r.notes ? asStr(r.notes) : null,
    is_demo: Boolean(r.is_demo),
    email: r.email ? asStr(r.email) : null,
  };
}

export async function loadProfile(db: Sql, userId: string): Promise<Profile | null> {
  const rows = await db<Record<string, unknown>>`
    select p.*, r.name as region_name
    from profiles p
    left join regions r on r.id = p.region_id
    where p.user_id = ${userId}
  `;
  return rows[0] ? mapProfile(rows[0]) : null;
}

export async function requireProfile(db: Sql, userId: string): Promise<Profile> {
  const p = await loadProfile(db, userId);
  if (!p) throw new Error("Profil nicht gefunden");
  return p;
}

export async function visibleUserIds(db: Sql, me: Profile): Promise<string[] | null> {
  if (can(me.role, "contracts.view_all") || me.role === "super_admin") return null;
  if (me.role === "gebietsleiter" && me.region_id) {
    const rows = await db<{ user_id: string }>`
      select user_id from profiles where region_id = ${me.region_id}
    `;
    return Array.from(new Set([me.user_id, ...rows.map((r) => r.user_id)]));
  }
  if (me.role === "teamleiter") {
    const rows = await db<{ user_id: string }>`
      select user_id from profiles
      where user_id = ${me.user_id} or supervisor_id = ${me.user_id}
    `;
    return rows.map((r) => r.user_id);
  }
  return [me.user_id];
}

export async function assertCanSeeUser(db: Sql, me: Profile, userId: string) {
  const ids = await visibleUserIds(db, me);
  if (ids && !ids.includes(userId) && me.user_id !== userId) {
    throw new Error("Kein Zugriff");
  }
}

export async function audit(
  db: Sql,
  input: {
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    oldValues?: unknown;
    newValues?: unknown;
  },
) {
  await db`
    insert into audit_log (id, user_id, action, entity_type, entity_id, old_values, new_values)
    values (
      ${nid()},
      ${input.userId},
      ${input.action},
      ${input.entityType},
      ${input.entityId},
      ${JSON.stringify(input.oldValues ?? null)}::jsonb,
      ${JSON.stringify(input.newValues ?? null)}::jsonb
    )
  `;
}

export async function notify(
  db: Sql,
  input: { userId: string; type: string; title: string; message: string; link?: string },
) {
  await db`
    insert into notifications (id, user_id, type, title, message, link)
    values (${nid()}, ${input.userId}, ${input.type}, ${input.title}, ${input.message}, ${input.link ?? null})
  `;
}

export async function flagsMap(db: Sql, profile?: { user_id: string; role: Role } | null) {
  const rows = await db<{ key: string; enabled: boolean }>`select key, enabled from feature_flags`;
  const global: Record<string, boolean> = { ...DEFAULT_STAFF_FLAGS };
  for (const r of rows) global[r.key] = Boolean(r.enabled);
  if (!profile) return global;
  if (profile.role === "super_admin") return allFlagsOn();
  const personal = await db<{ key: string; enabled: boolean }>`
    select key, enabled from profile_flags where user_id = ${profile.user_id}
  `;
  const out: Record<string, boolean> = { ...DEFAULT_STAFF_FLAGS };
  for (const r of personal) out[r.key] = Boolean(r.enabled);
  return out;
}

export function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "Mitglied", last: "E1" };
  if (parts.length === 1) return { first: parts[0]!, last: "" };
  return { first: parts[0]!, last: parts.slice(1).join(" ") };
}
