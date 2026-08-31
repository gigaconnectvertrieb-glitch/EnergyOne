import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { can, type Role } from "@/lib/e1";
import { bboxAround, DEFAULT_STREETS_PER_DAY, planWorkdays, searchDeCities, type PlanStop } from "@/lib/geo-de";
import { asStr, nid, num } from "@/lib/utils";
import { nominatimPlaces, overpassStreets } from "./geo.server";
import { audit, requireProfile, sql } from "./helpers";

function canPlan(role: Role) {
  return can(role, "team.view") || can(role, "settings.manage");
}

export const searchPlaces = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { q: string }) => d)
  .handler(async ({ data }) => {
    const local = searchDeCities(data.q, 6).map((c) => {
      const b = bboxAround(c.lat, c.lng, 2.4);
      return {
        name: c.name,
        state: c.state,
        lat: c.lat,
        lng: c.lng,
        display: `${c.name}, ${c.state}`,
        south: b.south,
        north: b.north,
        west: b.west,
        east: b.east,
        source: "liste" as const,
      };
    });
    try {
      const remote = await nominatimPlaces(data.q);
      const seen = new Set(local.map((x) => x.name.toLowerCase()));
      const extra = remote
        .filter((r) => !seen.has(r.name.toLowerCase()))
        .slice(0, 6)
        .map((r) => ({ ...r, source: "osm" as const }));
      return [...local, ...extra].slice(0, 10);
    } catch {
      return local;
    }
  });

export const importCityPlan = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: {
    name: string;
    city: string;
    state: string;
    lat: number;
    lng: number;
    south: number;
    north: number;
    west: number;
    east: number;
    perDay?: number;
    userIds?: string[];
  }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!canPlan(me.role)) throw new Error("Kein Zugriff auf die Planung.");
    const streets = await overpassStreets({
      south: data.south,
      north: data.north,
      west: data.west,
      east: data.east,
    });
    if (!streets.length) throw new Error("Keine Straßen in diesem Ausschnitt. Stadtteil suchen oder Fläche enger setzen.");
    const terId = nid();
    const geojson = JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: data.city },
          geometry: {
            type: "Polygon",
            coordinates: [[
              [data.west, data.south],
              [data.east, data.south],
              [data.east, data.north],
              [data.west, data.north],
              [data.west, data.south],
            ]],
          },
        },
      ],
    });
    const owner = data.userIds?.[0] || context.userId;
    await db`
      insert into territories (id, name, user_id, filename, geojson, center_lat, center_lng, uploaded_by)
      values (
        ${terId}, ${data.name || data.city}, ${owner}, ${`${data.city}.geojson`},
        ${geojson}, ${data.lat}, ${data.lng}, ${context.userId}
      )
    `;
    const stops: PlanStop[] = [];
    for (const s of streets) {
      const id = nid();
      await db`
        insert into field_doors (id, territory_id, street, house, zip, city, lat, lng, note, status)
        values (${id}, ${terId}, ${s.name}, ${""}, ${""}, ${data.city}, ${s.lat}, ${s.lng}, ${"OSM " + s.osm_id}, ${"offen"})
      `;
      stops.push({ id, lat: s.lat, lng: s.lng, street: s.name });
    }
    const perDay = data.perDay || DEFAULT_STREETS_PER_DAY;
    const days = planWorkdays(stops, perDay, { lat: data.lat, lng: data.lng });
    const planId = nid();
    await db`
      insert into work_plans (id, territory_id, city, state, per_day, created_by)
      values (${planId}, ${terId}, ${data.city}, ${data.state}, ${perDay}, ${context.userId})
    `;
    const users = (data.userIds || []).filter(Boolean);
    const assignees = users.length ? users : [owner];
    for (const d of days) {
      const dayId = nid();
      const uid = assignees[(d.day - 1) % assignees.length];
      await db`
        insert into work_days (id, plan_id, day_index, user_id, meters, stop_count, status)
        values (${dayId}, ${planId}, ${d.day}, ${uid}, ${d.meters}, ${d.stops.length}, ${"offen"})
      `;
      let seq = 1;
      for (const st of d.stops) {
        await db`
          insert into work_stops (id, day_id, door_id, seq, street, lat, lng)
          values (${nid()}, ${dayId}, ${st.id}, ${seq}, ${st.street}, ${st.lat}, ${st.lng})
        `;
        seq += 1;
      }
    }
    await audit(db, {
      userId: context.userId,
      action: "plan.import",
      entityType: "work_plan",
      entityId: planId,
      newValues: { city: data.city, streets: streets.length, days: days.length },
    });
    return { planId, territoryId: terId, streets: streets.length, days: days.length };
  });

export const listWorkPlans = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const rows = canPlan(me.role)
      ? await db<Record<string, unknown>>`
          select p.*, t.name as territory_name,
            (select count(*)::int from work_days d where d.plan_id = p.id) as days
          from work_plans p
          left join territories t on t.id = p.territory_id
          order by p.created_at desc
          limit 40
        `
      : await db<Record<string, unknown>>`
          select p.*, t.name as territory_name,
            (select count(*)::int from work_days d where d.plan_id = p.id) as days
          from work_plans p
          left join territories t on t.id = p.territory_id
          where exists (select 1 from work_days d where d.plan_id = p.id and d.user_id = ${me.user_id})
          order by p.created_at desc
          limit 20
        `;
    return rows.map((r) => ({
      id: asStr(r.id),
      city: asStr(r.city),
      state: asStr(r.state),
      territory_name: asStr(r.territory_name),
      per_day: num(r.per_day),
      days: num(r.days),
      created_at: asStr(r.created_at),
    }));
  });

export const getWorkPlan = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const db = await sql();
    const [plan] = await db<Record<string, unknown>>`select * from work_plans where id = ${data.id}`;
    if (!plan) throw new Error("Plan nicht gefunden");
    const days = await db<Record<string, unknown>>`
      select d.*, p.first_name, p.last_name
      from work_days d
      left join profiles p on p.user_id = d.user_id
      where d.plan_id = ${data.id}
      order by d.day_index
    `;
    const out = [];
    for (const d of days) {
      const stops = await db<Record<string, unknown>>`
        select * from work_stops where day_id = ${asStr(d.id)} order by seq
      `;
      out.push({
        id: asStr(d.id),
        day: num(d.day_index),
        user_id: asStr(d.user_id),
        advisor: `${asStr(d.first_name)} ${asStr(d.last_name)}`.trim(),
        meters: num(d.meters),
        stop_count: num(d.stop_count),
        status: asStr(d.status),
        stops: stops.map((s) => ({
          id: asStr(s.id),
          seq: num(s.seq),
          street: asStr(s.street),
          lat: num(s.lat),
          lng: num(s.lng),
        })),
      });
    }
    return {
      id: asStr(plan.id),
      city: asStr(plan.city),
      state: asStr(plan.state),
      per_day: num(plan.per_day),
      days: out,
    };
  });

export const assignWorkDay = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { dayId: string; userId: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!canPlan(me.role)) throw new Error("Kein Zugriff");
    await db`update work_days set user_id = ${data.userId} where id = ${data.dayId}`;
    return { ok: true };
  });

export const getAppToday = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const [day] = await db<Record<string, unknown>>`
      select d.*, p.city, p.state, t.name as territory_name
      from work_days d
      join work_plans p on p.id = d.plan_id
      left join territories t on t.id = p.territory_id
      where d.user_id = ${me.user_id} and d.status = 'offen'
      order by d.day_index
      limit 1
    `;
    const [open] = await db<{ n: number }>`
      select count(*)::int as n from field_visits
      where user_id = ${me.user_id} and list_status = 'offen'
        and reason in ('nicht_angetroffen','laufzeit_passt_nicht','kein_zutritt','spaeter')
    `;
    if (!day) {
      return {
        name: me.first_name,
        city: "",
        territory: "",
        day: 0,
        day_id: "",
        meters: 0,
        openFollowups: num(open?.n),
        stops: [] as { id: string; seq: number; street: string; lat: number; lng: number }[],
      };
    }
    const stops = await db<Record<string, unknown>>`
      select * from work_stops where day_id = ${asStr(day.id)} order by seq
    `;
    return {
      name: me.first_name,
      city: asStr(day.city),
      territory: asStr(day.territory_name),
      day: num(day.day_index),
      day_id: asStr(day.id),
      meters: num(day.meters),
      openFollowups: num(open?.n),
      stops: stops.map((s) => ({
        id: asStr(s.id),
        seq: num(s.seq),
        street: asStr(s.street),
        lat: num(s.lat),
        lng: num(s.lng),
      })),
    };
  });
