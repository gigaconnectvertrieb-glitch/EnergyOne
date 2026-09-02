import { bboxAround, STREET_CAP, type DeCity } from "@/lib/geo-de";

const UA = "E1Direktvertrieb/1.0 (info@e1direktvertrieb.de)";
const HOUSE_CAP = 1500;
const OVERPASS_MIRRORS = [
  process.env.OVERPASS_URL,
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
].filter((u): u is string => Boolean(u));

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

async function fetchJson(url: string | URL, init: RequestInit, err: string) {
  const res = await fetch(url, {
    ...init,
    headers: { "user-agent": UA, accept: "application/json", ...(init.headers || {}) },
    signal: init.signal ?? AbortSignal.timeout(18000),
  });
  if (!res.ok) throw new Error(err);
  return res.json();
}

export async function nominatimPlaces(query: string): Promise<PlaceHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const zip = /^\d{5}$/.test(q);
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "de");
  url.searchParams.set("limit", "8");
  if (zip) {
    url.searchParams.set("postalcode", q);
    url.searchParams.set("country", "de");
  } else {
    url.searchParams.set("q", q);
  }
  const rows = (await fetchJson(url, {}, "Städtesuche gerade nicht erreichbar.")) as Array<{
    lat: string;
    lon: string;
    display_name: string;
    osm_id?: number;
    boundingbox?: string[];
    address?: { city?: string; town?: string; village?: string; state?: string; suburb?: string; postcode?: string };
  }>;
  return rows.map((r) => {
    const bb = r.boundingbox || [];
    const lat = asNum(r.lat);
    const lng = asNum(r.lon);
    const box = bboxAround(lat, lng, zip ? 1.6 : 2.4);
    const name = zip
      ? `${r.address?.postcode || q} ${r.address?.suburb || r.address?.city || r.address?.town || r.address?.village || ""}`.trim()
      : r.address?.suburb || r.address?.city || r.address?.town || r.address?.village || q;
    return {
      name,
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

function clampBbox(p: { south: number; north: number; west: number; east: number }, max = 0.045) {
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

type OverpassEl = {
  id?: number;
  type?: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: {
    name?: string;
    highway?: string;
    "addr:housenumber"?: string;
    "addr:street"?: string;
    "addr:place"?: string;
    "addr:postcode"?: string;
    "building:flats"?: string;
    "addr:flats"?: string;
    "building:apartments"?: string;
  };
};

async function overpassJson(query: string): Promise<{ elements?: OverpassEl[] }> {
  let last = "keine Antwort";
  for (const url of OVERPASS_MIRRORS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "user-agent": UA,
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          accept: "application/json",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(22000),
      });
      if (!res.ok) {
        last = `HTTP ${res.status}`;
        continue;
      }
      const json = (await res.json()) as { elements?: OverpassEl[]; remark?: string };
      if (Array.isArray(json.elements)) return json;
      last = "leere Antwort";
    } catch (e) {
      last = e instanceof Error ? e.message.replace(/^fetch failed$/i, "Verbindung abgebrochen") : "timeout";
    }
  }
  throw new Error(
    `OpenStreetMap antwortet nicht (${last}). Zone etwas kleiner zeichnen und nochmal versuchen.`,
  );
}

function streetsFromElements(elements: OverpassEl[]): OsmStreet[] {
  const byName = new Map<string, { osm_id: string; name: string; lat: number; lng: number; n: number }>();
  for (const el of elements) {
    const name = el.tags?.name?.trim();
    if (!name || !el.tags?.highway) continue;
    const lat = el.center?.lat ?? el.lat;
    const lng = el.center?.lon ?? el.lon;
    if (lat == null || lng == null) continue;
    const key = name.toLowerCase().replace(/\s+/g, " ");
    const prev = byName.get(key);
    if (!prev) byName.set(key, { osm_id: String(el.id || name), name, lat, lng, n: 1 });
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

export async function overpassStreets(bbox: {
  south: number;
  north: number;
  west: number;
  east: number;
}): Promise<OsmStreet[]> {
  const zone = await overpassZone(bbox);
  return zone.streets;
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
  units?: number;
};

function parseUnits(tags?: Record<string, string>) {
  if (!tags) return undefined;
  const raw = tags["building:flats"] || tags["addr:flats"] || tags["building:apartments"];
  if (!raw) return undefined;
  const n = Number(String(raw).replace(/[^\d]/g, ""));
  return n > 0 && n < 400 ? n : undefined;
}

function hitsFromOverpass(elements: OverpassEl[], streetFallback = ""): HouseHit[] {
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
    out.push({ house, lat: la, lng: ln, street: st, zip: el.tags?.["addr:postcode"] || "", units: parseUnits(el.tags) });
    if (out.length >= HOUSE_CAP) break;
  }
  return out.sort((a, b) => {
    const s = a.street.localeCompare(b.street, "de");
    return s || a.house.localeCompare(b.house, "de", { numeric: true });
  });
}

export async function overpassZone(bbox: {
  south: number;
  north: number;
  west: number;
  east: number;
}): Promise<{ streets: OsmStreet[]; houses: HouseHit[] }> {
  const b = clampBbox(bbox);
  return overpassBox(b);
}

async function overpassBox(b: { south: number; north: number; west: number; east: number }) {
  const query = `[out:json][timeout:20];(
  way["highway"~"^(residential|living_street|unclassified|tertiary|secondary)$"]["name"](${b.south},${b.west},${b.north},${b.east});
  nwr["addr:housenumber"]["addr:street"](${b.south},${b.west},${b.north},${b.east});
);out center;`;
  const json = await overpassJson(query);
  const elements = json.elements || [];
  return {
    streets: streetsFromElements(elements),
    houses: hitsFromOverpass(elements),
  };
}

function tileBbox(bbox: { south: number; north: number; west: number; east: number }, size = 0.035, maxTiles = 16) {
  const tiles: Array<{ south: number; north: number; west: number; east: number }> = [];
  const south = bbox.south;
  const north = bbox.north;
  const west = bbox.west;
  const east = bbox.east;
  for (let s = south; s < north && tiles.length < maxTiles; s += size) {
    for (let w = west; w < east && tiles.length < maxTiles; w += size) {
      tiles.push({
        south: s,
        west: w,
        north: Math.min(s + size, north),
        east: Math.min(w + size, east),
      });
    }
  }
  return tiles.length ? tiles : [clampBbox(bbox)];
}

/** Ganze Stadt/Stadtteil: Kacheln, damit Overpass nicht abwürgt. */
export async function overpassArea(bbox: {
  south: number;
  north: number;
  west: number;
  east: number;
}): Promise<{ streets: OsmStreet[]; houses: HouseHit[]; tiles: number }> {
  const span = Math.max(bbox.north - bbox.south, bbox.east - bbox.west);
  const tiles = span > 0.05 ? tileBbox(bbox) : [clampBbox(bbox, 0.08)];
  const streetMap = new Map<string, OsmStreet>();
  const houseMap = new Map<string, HouseHit>();
  for (const t of tiles) {
    const part = await overpassBox(t);
    for (const s of part.streets) {
      const k = s.name.toLowerCase();
      if (!streetMap.has(k)) streetMap.set(k, s);
    }
    for (const h of part.houses) {
      houseMap.set(`${h.street.toLowerCase()}|${h.house}`, h);
    }
  }
  return {
    streets: [...streetMap.values()].sort((a, b) => a.name.localeCompare(b.name, "de")),
    houses: [...houseMap.values()],
    tiles: tiles.length,
  };
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
  const rows = (await fetchJson(url, {}, "Adresssuche gerade nicht erreichbar.")) as Array<{
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

export async function googleGeocode(query: string): Promise<AddressHit[]> {
  const key = (process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_KEY || "").trim();
  if (!key) return nominatimAddress(query);
  const q = query.trim();
  if (q.length < 3) return [];
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", q);
  url.searchParams.set("region", "de");
  url.searchParams.set("language", "de");
  url.searchParams.set("key", key);
  try {
    const json = (await fetchJson(url, {}, "Google Geocoding nicht erreichbar.")) as {
      status?: string;
      results?: Array<{
        formatted_address: string;
        geometry: { location: { lat: number; lng: number } };
        address_components: Array<{ long_name: string; types: string[] }>;
      }>;
    };
    if (json.status && json.status !== "OK" && json.status !== "ZERO_RESULTS") {
      return nominatimAddress(query);
    }
    return (json.results || []).slice(0, 8).map((r) => {
      const part = (t: string) => r.address_components.find((c) => c.types.includes(t))?.long_name || "";
      return {
        display: r.formatted_address,
        lat: r.geometry.location.lat,
        lng: r.geometry.location.lng,
        street: part("route"),
        house: part("street_number"),
        zip: part("postal_code"),
        city: part("locality") || part("administrative_area_level_3") || part("postal_town"),
      };
    });
  } catch {
    return nominatimAddress(query);
  }
}

export async function googlePlacesSearch(query: string): Promise<AddressHit[]> {
  const key = (process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_KEY || "").trim();
  if (!key) return googleGeocode(query);
  const q = query.trim();
  if (q.length < 3) return [];
  const auto = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  auto.searchParams.set("input", q);
  auto.searchParams.set("components", "country:de");
  auto.searchParams.set("language", "de");
  auto.searchParams.set("key", key);
  try {
    const json = (await fetchJson(auto, {}, "Places nicht erreichbar.")) as {
      status?: string;
      predictions?: Array<{ description: string; place_id: string }>;
    };
    if (!json.predictions?.length) return googleGeocode(query);
    const out: AddressHit[] = [];
    for (const p of json.predictions.slice(0, 6)) {
      const det = new URL("https://maps.googleapis.com/maps/api/place/details/json");
      det.searchParams.set("place_id", p.place_id);
      det.searchParams.set("fields", "formatted_address,geometry,address_component");
      det.searchParams.set("language", "de");
      det.searchParams.set("key", key);
      const d = (await fetchJson(det, {}, "Places Details nicht erreichbar.")) as {
        result?: {
          formatted_address?: string;
          geometry?: { location?: { lat: number; lng: number } };
          address_components?: Array<{ long_name: string; types: string[] }>;
        };
      };
      const loc = d.result?.geometry?.location;
      if (!loc) continue;
      const part = (t: string) => d.result?.address_components?.find((c) => c.types.includes(t))?.long_name || "";
      out.push({
        display: d.result?.formatted_address || p.description,
        lat: loc.lat,
        lng: loc.lng,
        street: part("route"),
        house: part("street_number"),
        zip: part("postal_code"),
        city: part("locality") || part("administrative_area_level_3") || "",
      });
    }
    return out.length ? out : googleGeocode(query);
  } catch {
    return googleGeocode(query);
  }
}

export async function overpassHouses(lat: number, lng: number, street?: string): Promise<HouseHit[]> {
  try {
    const query = `[out:json][timeout:20];nwr["addr:housenumber"](around:220,${lat},${lng});out center;`;
    const json = await overpassJson(query);
    const all = hitsFromOverpass(json.elements || [], street);
    const want = (street || "").trim().toLowerCase();
    if (!want) return all.slice(0, 200);
    const match = all.filter((h) => h.street.toLowerCase().includes(want) || want.includes(h.street.toLowerCase()));
    return (match.length ? match : all).slice(0, 200);
  } catch {
    return [];
  }
}

export async function overpassHousesBbox(bbox: {
  south: number;
  north: number;
  west: number;
  east: number;
}): Promise<HouseHit[]> {
  const zone = await overpassZone(bbox);
  return zone.houses;
}
