import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { can } from "@/lib/e1";
import { asStr, nid } from "@/lib/utils";
import { notify, requireProfile, sql } from "./helpers";

export const startEmergency = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const room = `E1Feld-${(me.user_id || "x").slice(0, 6)}-${Date.now().toString(36)}`;
    const id = nid();
    await db`
      insert into field_emergencies (id, user_id, room, status)
      values (${id}, ${me.user_id}, ${room}, 'offen')
    `;
    const bosses = await db<{ user_id: string }>`
      select user_id from profiles
      where role = 'super_admin' and status = 'active' and user_id <> ${me.user_id}
    `;
    const name = `${me.first_name} ${me.last_name}`.trim();
    for (const b of bosses) {
      await notify(db, {
        userId: b.user_id,
        type: "notfall",
        title: `Notfall ${name}`,
        message: "Mitarbeiter braucht euch live vor Ort.",
        link: `/app/notfall?room=${encodeURIComponent(room)}`,
      });
      try {
        const { sendPushToUser } = await import("./push.server");
        await sendPushToUser(db, b.user_id, {
          title: `Notfall ${name}`,
          body: "Jetzt zuschalten",
          url: `/app/notfall?room=${encodeURIComponent(room)}`,
        });
      } catch {
        /* */
      }
    }
    return { id, room };
  });

export const listEmergencies = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "team.view")) {
      return (await db<Record<string, unknown>>`
        select e.*, p.first_name, p.last_name
        from field_emergencies e
        join profiles p on p.user_id = e.user_id
        where e.user_id = ${me.user_id} and e.status = 'offen'
        order by e.created_at desc limit 5
      `).map(mapRow);
    }
    return (await db<Record<string, unknown>>`
      select e.*, p.first_name, p.last_name
      from field_emergencies e
      join profiles p on p.user_id = e.user_id
      where e.status = 'offen' and e.created_at > now() - interval '6 hours'
      order by e.created_at desc
    `).map(mapRow);
  });

function mapRow(r: Record<string, unknown>) {
  return {
    id: asStr(r.id),
    room: asStr(r.room),
    name: `${asStr(r.first_name)} ${asStr(r.last_name)}`.trim(),
    created_at: asStr(r.created_at),
  };
}

export const closeEmergency = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    await db`
      update field_emergencies
      set status = 'zu', closed_at = now()
      where id = ${data.id} and (user_id = ${context.userId} or exists (
        select 1 from profiles where user_id = ${context.userId} and role = 'super_admin'
      ))
    `;
    return { ok: true };
  });
