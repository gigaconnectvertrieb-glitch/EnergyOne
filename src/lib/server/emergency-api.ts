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
      where role = 'super_admin' and status = 'active'
    `;
    const name = `${me.first_name} ${me.last_name}`.trim();
    const join = `/portal/notfall?room=${encodeURIComponent(room)}`;
    for (const b of bosses) {
      await notify(db, {
        userId: b.user_id,
        type: "notfall",
        title: `${name} braucht Hilfe`,
        message: "Bitte einmal zuschalten.",
        link: join,
      });
      try {
        const { sendPushToUser } = await import("./push.server");
        await sendPushToUser(db, b.user_id, {
          title: `${name} braucht Hilfe`,
          body: "Bitte einmal zuschalten.",
          url: join,
        });
      } catch {
        /* */
      }
    }
    try {
      const { gmailAppPasswordReady, sendViaAppPassword } = await import("./smtp-gmail.server");
      if (gmailAppPasswordReady()) {
        await sendViaAppPassword({
          to: "orhan.salo@e1direktvertrieb.de,luca.marrancone@e1direktvertrieb.de",
          subject: `${name} braucht Hilfe`,
          text: `${name} braucht Hilfe. Bitte einmal zuschalten.\n\nhttps://e1direktvertrieb.de${join}\n`,
        });
      }
    } catch {
      /* Mail optional */
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
    kind: asStr(r.kind) || "video",
    address: asStr(r.address),
    note: asStr(r.note),
    lat: r.lat != null ? Number(r.lat) : 0,
    lng: r.lng != null ? Number(r.lng) : 0,
  };
}

export const silentAlarm = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { lat?: number; lng?: number; address?: string; note?: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const id = nid();
    const room = `still-${id.slice(0, 8)}`;
    await db`
      insert into field_emergencies (id, user_id, room, status, kind, lat, lng, note, address)
      values (
        ${id}, ${me.user_id}, ${room}, 'offen', 'still',
        ${data.lat ?? null}, ${data.lng ?? null}, ${data.note || ""}, ${data.address || ""}
      )
    `;
    const bosses = await db<{ user_id: string }>`
      select user_id from profiles
      where role = 'super_admin' and status = 'active'
    `;
    const name = `${me.first_name} ${me.last_name}`.trim();
    const where = data.address || (data.lat && data.lng ? `${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}` : "kein GPS");
    const body = `${name} braucht Hilfe. ${where}${data.note ? ` · ${data.note}` : ""}`;
    for (const b of bosses) {
      await notify(db, {
        userId: b.user_id,
        type: "notfall",
        title: `${name} braucht Hilfe`,
        message: body,
        link: "/portal/standort",
      });
      try {
        const { sendPushToUser } = await import("./push.server");
        await sendPushToUser(db, b.user_id, {
          title: `${name} braucht Hilfe`,
          body: "Bitte Standort prüfen.",
          url: "/portal/standort",
        });
      } catch {
        /* */
      }
    }
    try {
      const { gmailAppPasswordReady, sendViaAppPassword } = await import("./smtp-gmail.server");
      if (gmailAppPasswordReady()) {
        await sendViaAppPassword({
          to: "orhan.salo@e1direktvertrieb.de,luca.marrancone@e1direktvertrieb.de",
          subject: `${name} braucht Hilfe`,
          text: `${body}\n\nhttps://e1direktvertrieb.de/portal/standort\n`,
        });
      }
    } catch {
      /* */
    }
    return { id };
  });

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
