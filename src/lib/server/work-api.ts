import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { can } from "@/lib/e1";
import { asStr, nid, num } from "@/lib/utils";
import { requireProfile, sql } from "./helpers";

export const myShift = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    const [row] = await db<Record<string, unknown>>`
      select * from work_shifts
      where user_id = ${context.userId} and ended_at is null
      order by started_at desc limit 1
    `;
    if (!row) return null;
    return {
      id: asStr(row.id),
      started_at: asStr(row.started_at),
      start_address: asStr(row.start_address),
      last_at: row.last_at ? asStr(row.last_at) : "",
    };
  });

export const startWork = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { lat?: number; lng?: number; address?: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    await db`
      update work_shifts set ended_at = now()
      where user_id = ${context.userId} and ended_at is null
    `;
    const id = nid();
    await db`
      insert into work_shifts (id, user_id, start_lat, start_lng, start_address, last_lat, last_lng, last_at)
      values (
        ${id}, ${context.userId}, ${data.lat ?? null}, ${data.lng ?? null},
        ${data.address || ""}, ${data.lat ?? null}, ${data.lng ?? null}, now()
      )
    `;
    if (data.lat != null && data.lng != null) {
      await db`
        insert into work_pings (id, shift_id, user_id, lat, lng, address)
        values (${nid()}, ${id}, ${context.userId}, ${data.lat}, ${data.lng}, ${data.address || ""})
      `;
    }
    return { id };
  });

export const pingWork = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { lat: number; lng: number; accuracy?: number; address?: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const [shift] = await db<{ id: string }>`
      select id from work_shifts where user_id = ${context.userId} and ended_at is null
      order by started_at desc limit 1
    `;
    if (!shift) return { ok: false };
    await db`
      insert into work_pings (id, shift_id, user_id, lat, lng, accuracy, address)
      values (${nid()}, ${shift.id}, ${context.userId}, ${data.lat}, ${data.lng}, ${data.accuracy ?? null}, ${data.address || ""})
    `;
    await db`
      update work_shifts
      set last_lat = ${data.lat}, last_lng = ${data.lng}, last_at = now()
      where id = ${shift.id}
    `;
    return { ok: true };
  });

export const stopWork = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    await db`
      update work_shifts set ended_at = now()
      where user_id = ${context.userId} and ended_at is null
    `;
    return { ok: true };
  });

export const listWorkLive = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "team.view")) throw new Error("Kein Zugriff");
    const rows = await db<Record<string, unknown>>`
      select s.*, p.first_name, p.last_name, p.staff_id
      from work_shifts s
      join profiles p on p.user_id = s.user_id
      where s.started_at >= now() - interval '36 hours'
      order by s.ended_at nulls first, s.last_at desc nulls last
    `;
    return rows.map((r) => ({
      id: asStr(r.id),
      user_id: asStr(r.user_id),
      name: `${asStr(r.first_name)} ${asStr(r.last_name)}`.trim(),
      staff_id: asStr(r.staff_id),
      started_at: asStr(r.started_at),
      ended_at: r.ended_at ? asStr(r.ended_at) : "",
      live: !r.ended_at,
      address: asStr(r.start_address),
      lat: num(r.last_lat || r.start_lat),
      lng: num(r.last_lng || r.start_lng),
      last_at: r.last_at ? asStr(r.last_at) : asStr(r.started_at),
    }));
  });
