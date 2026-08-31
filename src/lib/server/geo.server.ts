import { bboxAround, STREET_CAP, type DeCity } from "@/lib/geo-de";

const UA = "E1Direktvertrieb/1.0 (info@e1direktvertrieb.de)";

export type PlaceHit = DeCity & {
  osm_id?: string;
  display: string;
  south: number;
  north: number;
  west: number;
  east: number;
};

export type OsmStreet = {
  osm_id: string;
  name: string;
  lat: number;
  lng: number;
};

function asNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function nominatimPlaces(query: string): Promise<PlaceHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "de");
  url.searchParams.set("limit", "8");
  url.searchParams.set("q", q);
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
  if (!res.ok) throw new Error("Städtesuche gerade nicht erreichbar.");
  const rows = (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
    osm_id?: number;
    boundingbox?: string[];
    address?: { city?: string; town?: string; village?: string; state?: string; suburb?: string };
  }>;
  return rows.map((r) => {
    const bb = r.boundingbox || [];
    const lat = asNum(r.lat);
    const lng = asNum(r.lon);
    const box = bboxAround(lat, lng, 2.4);
    return {
      name: r.address?.suburb || r.address?.city || r.address?.town || r.address?.village || q,
      state: r.address?.state || "Deutschland",
      lat,
      lng,
      display: r.display_name,
      osm_id: r.osm_id ? String(r.osm_id) : undefined,
      south: asNum(bb[0]) || box.south,
      north: asNum(bb[1]) || box.north,
      west: asNum(bb[2]) || box.west,
      east: asNum(bb[3]) || box.east,
    };
  });
}

function clampBbox(p: { south: number; north: number; west: number; east: number }) {
  const max = 0.06;
  let { south, north, west, east } = p;
  if (north - south > max) {
    const mid = (north + south) / 2;
    south = mid - max / 2;
    north = mid + max / 2;
  }
  if (east - west > max) {
    const mid = (east + west) / 2;
    west = mid - max / 2;
    east = mid + max / 2;
  }
  return { south, north, west, east };
}

export async function overpassStreets(bbox: { south: number; north: number; west: number; east: number }): Promise<OsmStreet[]> {
  const b = clampBbox(bbox);
  const query = `[out:json][timeout:25];way["highway"~"^(residential|living_street|unclassified|tertiary)$"]["name"](${b.south},${b.west},${b.north},${b.east});out center ${STREET_CAP};`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) throw new Error("Straßenimport gerade nicht erreichbar. In einer Minute erneut versuchen.");
  const json = (await res.json()) as {
    elements?: Array<{ id: number; tags?: { name?: string }; center?: { lat: number; lon: number } }>;
  };
  const byName = new Map<string, { osm_id: string; name: string; lat: number; lng: number; n: number }>();
  for (const el of json.elements || []) {
    const name = el.tags?.name?.trim();
    const lat = el.center?.lat;
    const lng = el.center?.lon;
    if (!name || lat == null || lng == null) continue;
    const key = name.toLowerCase().replace(/\s+/g, " ");
    const prev = byName.get(key);
    if (!prev) byName.set(key, { osm_id: String(el.id), name, lat, lng, n: 1 });
    else {
      prev.lat += lat;
      prev.lng += lng;
      prev.n += 1;
    }
    if (byName.size >= STREET_CAP) break;
  }
  return [...byName.values()].map((s) => ({
    osm_id: s.osm_id,
    name: s.name,
    lat: s.lat / s.n,
    lng: s.lng / s.n,
  }));
}
