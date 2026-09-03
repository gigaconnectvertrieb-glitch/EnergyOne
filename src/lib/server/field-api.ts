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
import { groupStreets, pointInPolygon, applyWalkOrder, haversineMeters } from "@/lib/geo-de";
import { googlePlacesSearch, overpassHouses } from "./geo.server";
import { assertCanSeeUser, audit, notify, requireProfile, sql, visibleUserIds } from "./helpers";
import type { Sql } from "@/lib/db";

async function assignedTerritory(db: Sql, userId: string) {
  const [ter] = await db<Record<string, unknown>>`
    select t.* from territories t
    where t.active = true
      and (
        t.user_id = ${userId}
        or exists (
          select 1 from territory_members m
          where m.territory_id = t.id and m.user_id = ${userId}
        )
      )
    order by t.updated_at desc
    limit 1
  `;
  return ter || null;
}

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

function mapYield(houses: number, we: number, deals: number) {
  const base = we > 0 ? we : houses;
  return {
    houses,
    units: we,
    deals,
    pct: base > 0 ? Math.round((deals / base) * 1000) / 10 : 0,
  };
}

async function yieldFor(db: Awaited<ReturnType<typeof sql>>, terId: string) {
  const [door] = await db<{ houses: number; we: number }>`
    select count(*)::int as houses, coalesce(sum(coalesce(units, 1)), 0)::int as we
    from field_doors where territory_id = ${terId}
  `;
  const [deal] = await db<{ n: number }>`
    select count(*)::int as n
    from contracts co
    join customers cu on cu.id = co.customer_id
    where co.status <> 'storniert'
      and exists (
        select 1 from field_doors fd
        where fd.territory_id = ${terId}
          and lower(fd.street) = lower(cu.street)
          and fd.house = cu.house_number
      )
  `;
  return mapYield(num(door?.houses), num(door?.we), num(deal?.n));
}

export const getFieldHome = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const ter = await assignedTerritory(db, me.user_id);
    const used = ter || null;
    const week = weekKey();
    const [open] = await db<{ n: number }>`
      select count(*)::int as n from field_visits
      where user_id = ${me.user_id} and list_status = 'offen' and reason in ('nicht_angetroffen','laufzeit_passt_nicht','kein_zutritt','spaeter')
    `;
    const [pending] = await db<Record<string, unknown>>`
      select t.id, t.name
      from territory_members m
      join territories t on t.id = m.territory_id
      where m.user_id = ${me.user_id} and t.active = true and m.accepted_at is null
      order by m.created_at desc
      limit 1
    `;
    const yieldNow = used ? await yieldFor(db, asStr(used.id)) : null;
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
      pending: pending
        ? { id: asStr(pending.id), name: asStr(pending.name) }
        : null,
      openFollowups: num(open?.n),
      week,
      yield: yieldNow,
    };
  });

export const getMyTerritory = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const mine = await assignedTerritory(db, me.user_id);
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
    const mine = await assignedTerritory(db, me.user_id);
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
             (select count(*)::int from field_doors d where d.territory_id = t.id) as door_count,
             (
               select string_agg(trim(m.first_name || ' ' || m.last_name), ', ' order by m.last_name)
               from territory_members tm
               join profiles m on m.user_id = tm.user_id
               where tm.territory_id = t.id
             ) as member_names
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
      advisor: asStr(r.member_names) || `${asStr(r.first_name)} ${asStr(r.last_name)}`.trim(),
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
    if (userId) {
      await db`insert into territory_members (territory_id, user_id) values (${id}, ${userId}) on conflict do nothing`;
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
    await db`
      insert into territory_members (territory_id, user_id, accepted_at)
      values (${data.id}, ${data.userId}, null)
      on conflict (territory_id, user_id) do update set accepted_at = null
    `;
    const [ter] = await db<{ name: string }>`select name from territories where id = ${data.id}`;
    await notify(db, {
      userId: data.userId,
      type: "gebiet",
      title: "Neues Gebiet",
      message: ter?.name || "Gebiet liegt bereit.",
      link: "/app/karte",
    });
    try {
      const { sendPushToUser } = await import("./push.server");
      await sendPushToUser(db, data.userId, {
        title: "Neues Gebiet",
        body: ter?.name || "Gebiet herunterladen",
        url: "/app/karte",
      });
    } catch {
      /* push optional */
    }
    await audit(db, {
      userId: context.userId,
      action: "territory.assign",
      entityType: "territory",
      entityId: data.id,
      newValues: { userId: data.userId },
    });
    return { ok: true };
  });

export const downloadTerritory = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "team.view") && me.role !== "super_admin") throw new Error("Kein Zugriff");
    const [ter] = await db<Record<string, unknown>>`select * from territories where id = ${data.id}`;
    if (!ter) throw new Error("Gebiet nicht gefunden.");
    const doors = await db<Record<string, unknown>>`
      select street, house, zip, city, lat, lng from field_doors
      where territory_id = ${data.id}
      order by street, house
    `;
    const csv = [
      "Straße;Hausnummer;PLZ;Ort;Lat;Lng",
      ...doors.map(
        (d) =>
          `${asStr(d.street)};${asStr(d.house)};${asStr(d.zip)};${asStr(d.city)};${num(d.lat)};${num(d.lng)}`,
      ),
    ].join("\n");
    let polygon: unknown[] = [];
    try {
      const gj = JSON.parse(asStr(ter.geojson)) as { features?: unknown[] };
      polygon = gj.features || [];
    } catch {
      polygon = [];
    }
    const points = doors.map((d) => ({
      type: "Feature",
      properties: {
        street: asStr(d.street),
        house: asStr(d.house),
        zip: asStr(d.zip),
        city: asStr(d.city),
      },
      geometry: { type: "Point", coordinates: [num(d.lng), num(d.lat)] },
    }));
    const geojson = JSON.stringify(
      { type: "FeatureCollection", features: [...polygon, ...points] },
      null,
      2,
    );
    const slug = asStr(ter.name).replace(/[^\w.\-äöüÄÖÜß]+/g, "_") || "gebiet";
    return { filename: slug, csv, geojson, count: doors.length, name: asStr(ter.name) };
  });

export const deleteTerritory = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "team.view") && !can(me.role, "settings.manage")) throw new Error("Kein Zugriff");
    const [row] = await db<{ id: string }>`select id from territories where id = ${data.id}`;
    if (!row) throw new Error("Gebiet nicht gefunden");
    await db`delete from territories where id = ${data.id}`;
    await audit(db, {
      userId: context.userId,
      action: "territory.delete",
      entityType: "territory",
      entityId: data.id,
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

export const listAllFollowups = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "team.view")) throw new Error("Kein Zugriff");
    const rows = await db<Record<string, unknown>>`
      select v.*, p.first_name, p.last_name
      from field_visits v
      left join profiles p on p.user_id = v.user_id
      where v.list_status = 'offen'
      order by v.created_at desc
      limit 300
    `;
    return rows.map((r) => ({
      id: asStr(r.id),
      street: asStr(r.street),
      house: asStr(r.house),
      zip: asStr(r.zip),
      city: asStr(r.city),
      reason: asStr(r.reason),
      follow_up_on: r.follow_up_on ? asStr(r.follow_up_on) : "",
      advisor: `${asStr(r.first_name)} ${asStr(r.last_name)}`.trim(),
      created_at: asStr(r.created_at),
    }));
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

export const searchFieldAddress = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { q: string }) => d)
  .handler(async ({ context, data }) => {
    const q = data.q.trim();
    if (q.length < 3) return [];
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const ter = await assignedTerritory(db, me.user_id);
    const places = await googlePlacesSearch(q);
    if (!can(me.role, "team.view") && ter) {
      const doors = await db<{ street: string; house: string; zip: string; city: string; lat: string; lng: string }>`
        select street, house, zip, city, lat::text, lng::text
        from field_doors
        where territory_id = ${asStr(ter.id)}
          and (street ilike ${"%" + q + "%"} or house ilike ${"%" + q + "%"} or zip ilike ${q + "%"})
        order by street, house
        limit 20
      `;
      const mine = doors.map((d) => ({
        display: `${d.street} ${d.house}, ${d.zip} ${d.city}`.trim(),
        lat: Number(d.lat),
        lng: Number(d.lng),
        street: d.street,
        house: d.house,
        zip: d.zip,
        city: d.city,
      }));
      return [...mine, ...places];
    }
    return places;
  });

export const openFieldObject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { lat: number; lng: number; street?: string; house?: string; zip?: string; city?: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const ter = await assignedTerritory(db, me.user_id);
    let inTerritory = true;
    let territoryName = "";
    if (ter?.geojson) {
      territoryName = asStr(ter.name);
      try {
        const gj = JSON.parse(asStr(ter.geojson)) as {
          features?: Array<{ geometry?: { type: string; coordinates: number[][][] } }>;
        };
        const ring = gj.features?.[0]?.geometry?.coordinates?.[0];
        if (ring?.length) {
          const pts = ring.map((c) => ({ lng: c[0]!, lat: c[1]! }));
          inTerritory = pointInPolygon({ lat: data.lat, lng: data.lng }, pts);
        }
      } catch {
        inTerritory = true;
      }
    }
    const houses = await overpassHouses(data.lat, data.lng, data.street);
    const zip = data.zip?.trim() || "";
    const street = data.street?.trim() || "";
    const customers = street
      ? (
          await db<Record<string, unknown>>`
            select id, first_name, last_name, phone from customers
            where (${zip} = '' or zip = ${zip})
              and lower(street) like ${"%" + street.toLowerCase() + "%"}
            limit 5
          `
        ).map((c) => ({
          id: asStr(c.id),
          name: `${asStr(c.first_name)} ${asStr(c.last_name)}`.trim(),
          phone: c.phone ? asStr(c.phone) : "",
        }))
      : [];
    return {
      inTerritory,
      territoryName,
      houses,
      customers,
      street: data.street || houses[0]?.street || "",
      house: data.house || "",
      zip: data.zip || "",
      city: data.city || "",
      lat: data.lat,
      lng: data.lng,
    };
  });

export const getTerritoryWalk = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { lat?: number; lng?: number }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const ter = await assignedTerritory(db, me.user_id);
    if (!ter) {
      return {
        name: "",
        center: { lat: 51.16, lng: 10.45 },
        ring: [] as Array<{ lat: number; lng: number }>,
        houses: [] as Array<{ id: string; street: string; house: string; lat: number; lng: number }>,
        walk: { streets: [], meters: 0, count: 0 },
      };
    }
    let ring: Array<{ lat: number; lng: number }> = [];
    try {
      const gj = JSON.parse(asStr(ter.geojson)) as {
        features?: Array<{ geometry?: { type: string; coordinates: number[][][] | number[][][][] } }>;
      };
      const geom = gj.features?.[0]?.geometry;
      const coords = geom?.type === "Polygon" ? geom.coordinates[0] : geom?.type === "MultiPolygon" ? geom.coordinates[0]?.[0] : null;
      if (coords) ring = coords.map((c) => ({ lng: Number(c[0]), lat: Number(c[1]) }));
    } catch {
      ring = [];
    }
    const doors = await db<Record<string, unknown>>`
      select id, street, house, zip, city, lat, lng, units from field_doors where territory_id = ${asStr(ter.id)} order by street, house
    `;
    const houses = doors.map((d) => ({
      id: asStr(d.id),
      street: asStr(d.street),
      house: asStr(d.house),
      zip: asStr(d.zip),
      city: asStr(d.city),
      lat: num(d.lat),
      lng: num(d.lng),
      units: d.units != null ? num(d.units) : undefined,
    }));
    let grouped = groupStreets(houses.map((h) => ({ ...h, house: h.house || "" })));
    if (typeof data.lat === "number" && typeof data.lng === "number") {
      const start = { lat: data.lat, lng: data.lng };
      grouped = [...grouped].sort((a, b) => {
        const aa = a.houses[0] || { lat: start.lat, lng: start.lng };
        const bb = b.houses[0] || { lat: start.lat, lng: start.lng };
        return haversineMeters(start, aa) - haversineMeters(start, bb);
      });
    }
    let walk = {
      streets: grouped.map((s) => ({ street: s.street, houses: s.houses, meters: 0 })),
      meters: 0,
      count: houses.length,
    };
    let custom = false;
    try {
      const saved = ter.walk_order ? (typeof ter.walk_order === "string" ? JSON.parse(asStr(ter.walk_order)) : ter.walk_order) : null;
      const order = saved && typeof saved === "object" && Array.isArray((saved as { streets?: unknown }).streets)
        ? (saved as { streets: Array<{ street: string; houses?: string[] }> }).streets
        : null;
      if (order?.length) {
        walk = applyWalkOrder(walk, order);
        custom = true;
      }
    } catch {
      custom = false;
    }
    return {
      name: asStr(ter.name),
      id: asStr(ter.id),
      center: { lat: num(ter.center_lat), lng: num(ter.center_lng) },
      ring,
      houses,
      walk,
      custom,
    };
  });

export const saveWalkOrder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { streets: Array<{ street: string; houses?: string[] }>; reset?: boolean }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const ter = await assignedTerritory(db, me.user_id);
    if (!ter) throw new Error("Kein Gebiet zugewiesen.");
    const payload = data.reset ? null : JSON.stringify({ streets: data.streets });
    await db`update territories set walk_order = ${payload}::jsonb, updated_at = now() where id = ${asStr(ter.id)}`;
    return { ok: true };
  });

export const setDoorUnits = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { doorId?: string; street: string; house: string; units: number }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const ter = await assignedTerritory(db, me.user_id);
    if (!ter) throw new Error("Kein Gebiet.");
    const units = Math.max(1, Math.min(200, Math.round(data.units)));
    if (data.doorId) {
      await db`update field_doors set units = ${units} where id = ${data.doorId} and territory_id = ${asStr(ter.id)}`;
    } else {
      await db`
        update field_doors set units = ${units}
        where territory_id = ${asStr(ter.id)} and street = ${data.street} and house = ${data.house}
      `;
    }
    return { ok: true, units };
  });

export const acceptTerritory = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    await db`
      update territory_members
      set accepted_at = now()
      where territory_id = ${data.id} and user_id = ${me.user_id}
    `;
    return { ok: true };
  });

export const fieldBalance = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const rows = await db<{ period: string; n: string; eur: string }>`
      select 'tag' as period,
        count(*)::text as n,
        coalesce(sum(coalesce(advisor_amount, commission_amount)),0)::text as eur
      from contracts
      where user_id = ${me.user_id} and status <> 'storniert'
        and created_at >= current_date
      union all
      select 'woche',
        count(*)::text,
        coalesce(sum(coalesce(advisor_amount, commission_amount)),0)::text
      from contracts
      where user_id = ${me.user_id} and status <> 'storniert'
        and created_at >= date_trunc('week', current_date)
      union all
      select 'monat',
        count(*)::text,
        coalesce(sum(coalesce(advisor_amount, commission_amount)),0)::text
      from contracts
      where user_id = ${me.user_id} and status <> 'storniert'
        and created_at >= date_trunc('month', current_date)
    `;
    const pick = (k: string) => rows.find((r) => r.period === k);
    const tag = pick("tag");
    const woche = pick("woche");
    const monat = pick("monat");
    return {
      name: `${me.first_name} ${me.last_name}`.trim(),
      role: me.role,
      tag: { n: Number(tag?.n || 0), eur: Number(tag?.eur || 0) },
      woche: { n: Number(woche?.n || 0), eur: Number(woche?.eur || 0) },
      monat: { n: Number(monat?.n || 0), eur: Number(monat?.eur || 0) },
    };
  });

export const claimTerritory = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "team.view")) throw new Error("Gebiet spielt die Leitung auf.");
    await db`
      insert into territory_members (territory_id, user_id)
      values (${data.id}, ${me.user_id})
      on conflict do nothing
    `;
    if (can(me.role, "team.view")) {
      await db`update territories set user_id = ${me.user_id}, updated_at = now() where id = ${data.id}`;
    }
    return { ok: true };
  });

export const requestTerritoryAccess = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { label: string; lat: number; lng: number }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const id = nid();
    const label = data.label.trim() || "Gebiet";
    await db`
      insert into territory_requests (id, user_id, label, lat, lng)
      values (${id}, ${me.user_id}, ${label}, ${data.lat}, ${data.lng})
    `;
    const bosses = await db<{ user_id: string }>`select user_id from profiles where role = 'super_admin' and status = 'active'`;
    const name = `${me.first_name} ${me.last_name}`.trim();
    for (const b of bosses) {
      await notify(db, {
        userId: b.user_id,
        type: "gebiet",
        title: `${name} will Gebiet`,
        message: label,
        link: "/portal/gebiete",
      });
      try {
        const { sendPushToUser } = await import("./push.server");
        await sendPushToUser(db, b.user_id, { title: `${name} will Gebiet`, body: label, url: "/portal/gebiete" });
      } catch {
        /* */
      }
    }
    return { ok: true };
  });

export const listTerritoryRequests = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "team.view")) return [];
    const rows = await db<Record<string, unknown>>`
      select r.id, r.label, p.first_name, p.last_name
      from territory_requests r
      join profiles p on p.user_id = r.user_id
      where r.status = 'offen'
      order by r.created_at desc
      limit 50
    `;
    return rows.map((r) => ({
      id: asStr(r.id),
      label: asStr(r.label),
      name: `${asStr(r.first_name)} ${asStr(r.last_name)}`.trim(),
    }));
  });

export const approveTerritoryRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "team.view")) throw new Error("Nur Leitung");
    const [req] = await db<{ user_id: string; label: string; lat: number; lng: number }>`
      select user_id, label, lat, lng from territory_requests where id = ${data.id} and status = 'offen'
    `;
    if (!req) throw new Error("Anfrage weg.");
    const tid = nid();
    const file = `${(req.label || "gebiet").replace(/\s+/g, "-").toLowerCase()}.json`;
    await db`
      insert into territories (id, name, filename, user_id, center_lat, center_lng, active)
      values (${tid}, ${req.label}, ${file}, ${req.user_id}, ${req.lat}, ${req.lng}, true)
    `;
    await db`insert into territory_members (territory_id, user_id) values (${tid}, ${req.user_id})`;
    await db`update territory_requests set status = 'ok' where id = ${data.id}`;
    await notify(db, {
      userId: req.user_id,
      type: "gebiet",
      title: "Gebiet freigegeben",
      message: `${req.label} — in der App herunterladen.`,
      link: "/app/karte",
    });
    return { ok: true };
  });


