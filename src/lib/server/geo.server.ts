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

export type AddressHit = {
  display: string;
  lat: number;
  lng: number;
  street: string;
  house: string;
  zip: string;
  city: string;
};

export type HouseHit = {
  house: string;
  lat: number;
  lng: number;
  street: string;
  zip?: string;
};

function hitsFromOverpass(
  elements: Array<{
    lat?: number;
    lon?: number;
    center?: { lat: number; lon: number };
    tags?: { "addr:housenumber"?: string; "addr:street"?: string; "addr:place"?: string; "addr:postcode"?: string };
  }>,
  streetFallback = "",
): HouseHit[] {
  const seen = new Set<string>();
  const out: HouseHit[] = [];
  for (const el of elements) {
    const house = el.tags?.["addr:housenumber"]?.trim();
    const st = el.tags?.["addr:street"]?.trim() || el.tags?.["addr:place"]?.trim() || streetFallback;
    const la = el.lat ?? el.center?.lat;
    const ln = el.lon ?? el.center?.lon;
    if (!house || !st || la == null || ln == null) continue;
    const key = `${st.toLowerCase()}|${house}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ house, lat: la, lng: ln, street: st, zip: el.tags?.["addr:postcode"] || "" });
  }
  return out.sort((a, b) => {
    const s = a.street.localeCompare(b.street, "de");
    return s || a.house.localeCompare(b.house, "de", { numeric: true });
  });
}

export async function nominatimAddress(query: string): Promise<AddressHit[]> {
  const q = query.trim();
  if (q.length < 5) return [];
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "de");
  url.searchParams.set("limit", "8");
  url.searchParams.set("q", q);
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
  if (!res.ok) throw new Error("Adresssuche gerade nicht erreichbar.");
  const rows = (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
    address?: {
      road?: string;
      pedestrian?: string;
      house_number?: string;
      postcode?: string;
      city?: string;
      town?: string;
      village?: string;
      municipality?: string;
    };
  }>;
  return rows.map((r) => ({
    display: r.display_name,
    lat: asNum(r.lat),
    lng: asNum(r.lon),
    street: r.address?.road || r.address?.pedestrian || "",
    house: r.address?.house_number || "",
    zip: r.address?.postcode || "",
    city: r.address?.city || r.address?.town || r.address?.village || r.address?.municipality || "",
  }));
}

export async function overpassHouses(lat: number, lng: number, street?: string): Promise<HouseHit[]> {
  const query = `[out:json][timeout:25];nwr["addr:housenumber"](around:220,${lat},${lng});out center;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { elements?: Parameters<typeof hitsFromOverpass>[0] };
  const all = hitsFromOverpass(json.elements || [], street);
  const want = (street || "").trim().toLowerCase();
  if (!want) return all.slice(0, 200);
  const match = all.filter((h) => h.street.toLowerCase().includes(want) || want.includes(h.street.toLowerCase()));
  return (match.length ? match : all).slice(0, 200);
}

export async function overpassHousesBbox(bbox: { south: number; north: number; west: number; east: number }): Promise<HouseHit[]> {
  const b = clampBbox({
    south: bbox.south,
    north: bbox.north,
    west: bbox.west,
    east: bbox.east,
  });
  const query = `[out:json][timeout:40];nwr["addr:housenumber"](${b.south},${b.west},${b.north},${b.east});out center;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { elements?: Parameters<typeof hitsFromOverpass>[0] };
  return hitsFromOverpass(json.elements || []).slice(0, 1500);
}
