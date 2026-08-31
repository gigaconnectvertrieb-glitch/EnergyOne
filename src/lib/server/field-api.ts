import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { can } from "@/lib/e1";
import {
  followupOn,
  needsFollowup,
  parseTerritoryFile,
  sortWeekly,
  weekKey,
} from "@/lib/field";
import { asStr, nid, num } from "@/lib/utils";
import { assertCanSeeUser, audit, requireProfile, sql, visibleUserIds } from "./helpers";

function mapDoor(r: Record<string, unknown>) {
  return {
    id: asStr(r.id),
    territory_id: asStr(r.territory_id),
    street: asStr(r.street),
    house: asStr(r.house),
    zip: asStr(r.zip),
    city: asStr(r.city),
    lat: num(r.lat),
    lng: num(r.lng),
    note: asStr(r.note),
    status: asStr(r.status),
  };
}

export const getFieldHome = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const [ter] = await db<Record<string, unknown>>`
      select * from territories
      where active = true and user_id = ${me.user_id}
      order by updated_at desc
      limit 1
    `;
    const used = ter || null;
    const week = weekKey();
    const [open] = await db<{ n: number }>`
      select count(*)::int as n from field_visits
      where user_id = ${me.user_id} and list_status = 'offen' and reason in ('nicht_angetroffen','laufzeit_passt_nicht','kein_zutritt','spaeter')
    `;
    return {
      territory: used
        ? {
            id: asStr(used.id),
            name: asStr(used.name),
            filename: asStr(used.filename),
            center_lat: num(used.center_lat),
            center_lng: num(used.center_lng),
          }
        : null,
      openFollowups: num(open?.n),
      week,
    };
  });

export const getMyTerritory = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const [own] = await db<Record<string, unknown>>`
      select * from territories where active = true and user_id = ${me.user_id} order by updated_at desc limit 1
    `;
    const mine = own || null;
    if (!mine) {
      return { name: "", filename: "", center_lat: 51.16, center_lng: 10.45, geojsonText: "", doors: [] as ReturnType<typeof mapDoor>[] };
    }
    const doors = await db<Record<string, unknown>>`
      select * from field_doors where territory_id = ${asStr(mine.id)} order by street, house
    `;
    return {
      name: asStr(mine.name),
      filename: asStr(mine.filename),
      center_lat: num(mine.center_lat),
      center_lng: num(mine.center_lng),
      geojsonText: asStr(mine.geojson),
      doors: doors.map(mapDoor),
    };
  });

export const downloadMyTerritory = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const [mine] = await db<Record<string, unknown>>`
      select * from territories where active = true and user_id = ${me.user_id} order by updated_at desc limit 1
    `;
    if (!mine && (me.role === "super_admin" || me.role === "teamleiter")) {
      const [any] = await db<Record<string, unknown>>`select * from territories where active = true order by updated_at desc limit 1`;
      if (!any) throw new Error("Kein Gebiet zugewiesen.");
      const doors = await db<Record<string, unknown>>`select * from field_doors where territory_id = ${asStr(any.id)}`;
      return {
        filename: asStr(any.filename) || "gebiet.geojson",
        json: JSON.stringify({ ...safeJson(asStr(any.geojson)), e1: { name: asStr(any.name), doors: doors.map(mapDoor) } }, null, 2),
      };
    }
    if (!mine) throw new Error("Kein Gebiet zugewiesen.");
    const doors = await db<Record<string, unknown>>`select * from field_doors where territory_id = ${asStr(mine.id)}`;
    return {
      filename: asStr(mine.filename) || "gebiet.geojson",
      json: JSON.stringify({ ...safeJson(asStr(mine.geojson)), e1: { name: asStr(mine.name), doors: doors.map(mapDoor) } }, null, 2),
    };
  });

function safeJson(text: string): Record<string, unknown> {
  try {
    const v = JSON.parse(text || "{}") as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const listTerritories = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "team.view") && me.role !== "super_admin") throw new Error("Kein Zugriff");
    const rows = await db<Record<string, unknown>>`
      select t.*, p.first_name, p.last_name, r.name as region_name,
             (select count(*)::int from field_doors d where d.territory_id = t.id) as door_count
      from territories t
      left join profiles p on p.user_id = t.user_id
      left join regions r on r.id = t.region_id
      order by t.updated_at desc
    `;
    return rows.map((r) => ({
      id: asStr(r.id),
      name: asStr(r.name),
      filename: asStr(r.filename),
      region_id: asStr(r.region_id),
      region_name: asStr(r.region_name),
      user_id: asStr(r.user_id),
      advisor: `${asStr(r.first_name)} ${asStr(r.last_name)}`.trim(),
      door_count: num(r.door_count),
      center_lat: num(r.center_lat),
      center_lng: num(r.center_lng),
      active: Boolean(r.active),
      created_at: asStr(r.created_at),
    }));
  });

export const uploadTerritory = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { name: string; filename: string; text: string; userId?: string; regionId?: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "settings.manage") && !can(me.role, "team.view")) throw new Error("Kein Zugriff");
    const parsed = parseTerritoryFile(data.filename || "gebiet.geojson", data.text);
    const id = nid();
    const userId = data.userId?.trim() || null;
    await db`
      insert into territories (id, name, region_id, user_id, filename, geojson, center_lat, center_lng, uploaded_by)
      values (
        ${id}, ${data.name.trim() || parsed.name}, ${data.regionId || null}, ${userId},
        ${data.filename || parsed.name + ".geojson"}, ${JSON.stringify(parsed.geojson)},
        ${parsed.center.lat}, ${parsed.center.lng}, ${context.userId}
      )
    `;
    for (const door of parsed.doors) {
      await db`
        insert into field_doors (id, territory_id, street, house, zip, city, lat, lng, note)
        values (${nid()}, ${id}, ${door.street}, ${door.house}, ${door.zip}, ${door.city}, ${door.lat}, ${door.lng}, ${door.note || null})
      `;
    }
    await audit(db, {
      userId: context.userId,
      action: "territory.upload",
      entityType: "territory",
      entityId: id,
      newValues: { doors: parsed.doors.length, userId },
    });
    return { id, doors: parsed.doors.length };
  });

export const assignTerritory = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string; userId: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "team.view")) throw new Error("Kein Zugriff");
    await db`update territories set user_id = ${data.userId}, updated_at = now() where id = ${data.id}`;
    await audit(db, {
      userId: context.userId,
      action: "territory.assign",
      entityType: "territory",
      entityId: data.id,
      newValues: { userId: data.userId },
    });
    return { ok: true };
  });

export const logFieldVisit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: {
    doorId?: string;
    reason: string;
    note?: string;
    street?: string;
    house?: string;
    zip?: string;
    city?: string;
    lat?: number;
    lng?: number;
  }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (me.status !== "active") throw new Error("Zugang nicht aktiv.");
    let door: Record<string, unknown> | undefined;
    if (data.doorId) {
      [door] = await db<Record<string, unknown>>`select * from field_doors where id = ${data.doorId}`;
    }
    const reason = data.reason;
    const follow = needsFollowup(reason) ? followupOn(reason) : null;
    const week = weekKey();
    const id = nid();
    await db`
      insert into field_visits (
        id, door_id, territory_id, user_id, reason, note, street, house, zip, city, lat, lng, follow_up_on, week_key, list_status
      ) values (
        ${id},
        ${data.doorId || null},
        ${door ? asStr(door.territory_id) : null},
        ${context.userId},
        ${reason},
        ${data.note?.trim() || null},
        ${data.street?.trim() || asStr(door?.street)},
        ${data.house?.trim() || asStr(door?.house)},
        ${data.zip?.trim() || asStr(door?.zip)},
        ${data.city?.trim() || asStr(door?.city)},
        ${data.lat ?? (door ? num(door.lat) : null)},
        ${data.lng ?? (door ? num(door.lng) : null)},
        ${follow},
        ${week},
        ${needsFollowup(reason) ? "offen" : "erledigt"}
      )
    `;
    if (data.doorId) {
      const doorStatus = reason === "abschluss" ? "abschluss" : needsFollowup(reason) ? "nachlauf" : "erledigt";
      await db`update field_doors set status = ${doorStatus} where id = ${data.doorId}`;
    }
    return { id, follow_up_on: follow };
  });

export const listWeeklyFollowups = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const ids = await visibleUserIds(db, me);
    const rows = ids
      ? await db<Record<string, unknown>>`
          select v.*, p.first_name, p.last_name
          from field_visits v
          left join profiles p on p.user_id = v.user_id
          where v.list_status = 'offen' and v.reason in ('nicht_angetroffen','laufzeit_passt_nicht','kein_zutritt','spaeter')
            and v.user_id = any(${ids})
            and coalesce(p.is_demo,false) = false
          order by v.follow_up_on nulls last, v.created_at`
      : await db<Record<string, unknown>>`
          select v.*, p.first_name, p.last_name
          from field_visits v
          left join profiles p on p.user_id = v.user_id
          where v.list_status = 'offen' and v.reason in ('nicht_angetroffen','laufzeit_passt_nicht','kein_zutritt','spaeter')
            and coalesce(p.is_demo,false) = false
          order by v.follow_up_on nulls last, v.created_at`;
    const mapped = rows.map((r) => ({
      id: asStr(r.id),
      reason: asStr(r.reason),
      note: asStr(r.note),
      street: asStr(r.street),
      house: asStr(r.house),
      zip: asStr(r.zip),
      city: asStr(r.city),
      lat: num(r.lat),
      lng: num(r.lng),
      follow_up_on: r.follow_up_on ? asStr(r.follow_up_on).slice(0, 10) : null,
      list_status: asStr(r.list_status),
      advisor: `${asStr(r.first_name)} ${asStr(r.last_name)}`.trim(),
      created_at: asStr(r.created_at),
    }));
    return { week: weekKey(), rows: sortWeekly(mapped) };
  });

export const setFollowupStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string; status: "offen" | "erledigt" }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const [row] = await db<{ user_id: string }>`select user_id from field_visits where id = ${data.id}`;
    if (!row) throw new Error("Eintrag nicht gefunden");
    await assertCanSeeUser(db, me, row.user_id);
    await db`update field_visits set list_status = ${data.status} where id = ${data.id}`;
    return { ok: true };
  });
