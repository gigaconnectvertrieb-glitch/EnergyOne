import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { asStr, nid } from "@/lib/utils";
import { requireProfile, sql } from "./helpers";

export const upsertBuilding = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { street: string; house: string; zip?: string; city?: string; floors: number; units: Array<{ floor: number; no: string; status?: string; note?: string }> }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    await requireProfile(db, context.userId);
    const floors = Math.max(1, Math.min(40, Number(data.floors) || 1));
    const [ex] = await db<{ id: string }>`
      select id from field_buildings
      where street = ${data.street.trim()} and house = ${data.house.trim()}
      limit 1
    `;
    const id = ex?.id || nid();
    if (!ex) {
      await db`
        insert into field_buildings (id, street, house, zip, city, floors)
        values (${id}, ${data.street.trim()}, ${data.house.trim()}, ${data.zip || ""}, ${data.city || ""}, ${floors})
      `;
    } else {
      await db`update field_buildings set floors = ${floors}, zip = ${data.zip || ""}, city = ${data.city || ""} where id = ${id}`;
      await db`delete from field_units where building_id = ${id}`;
    }
    for (const u of data.units.slice(0, 200)) {
      await db`
        insert into field_units (id, building_id, floor_no, unit_no, status, note)
        values (${nid()}, ${id}, ${u.floor}, ${u.no}, ${u.status || "offen"}, ${u.note || ""})
      `;
    }
    return { id };
  });

export const getBuilding = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { street: string; house: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    await requireProfile(db, context.userId);
    const [b] = await db<Record<string, unknown>>`
      select * from field_buildings
      where street = ${data.street.trim()} and house = ${data.house.trim()}
      limit 1
    `;
    if (!b) return null;
    const units = await db<Record<string, unknown>>`
      select * from field_units where building_id = ${asStr(b.id)} order by floor_no, unit_no
    `;
    return {
      id: asStr(b.id),
      street: asStr(b.street),
      house: asStr(b.house),
      zip: asStr(b.zip),
      city: asStr(b.city),
      floors: Number(b.floors) || 1,
      units: units.map((u) => ({
        id: asStr(u.id),
        floor: Number(u.floor_no) || 0,
        no: asStr(u.unit_no),
        status: asStr(u.status),
        note: asStr(u.note),
      })),
    };
  });

export const listBuildings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    await requireProfile(db, context.userId);
    const rows = await db<Record<string, unknown>>`
      select b.*, (select count(*) from field_units u where u.building_id = b.id) as units
      from field_buildings b
      order by b.city, b.street, b.house
      limit 300
    `;
    return rows.map((r) => ({
      id: asStr(r.id),
      street: asStr(r.street),
      house: asStr(r.house),
      zip: asStr(r.zip),
      city: asStr(r.city),
      floors: Number(r.floors) || 1,
      units: Number(r.units) || 0,
    }));
  });

export const setUnitStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string; status: string; note?: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    await requireProfile(db, context.userId);
    await db`
      update field_units set status = ${data.status}, note = ${data.note || ""}, updated_at = now()
      where id = ${data.id}
    `;
    return { ok: true };
  });
