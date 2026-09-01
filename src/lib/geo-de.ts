/** Deutsche Städte für die Gebietsplanung. Suche lokal, Straßen kommen aus OSM. */

export type DeCity = {
  name: string;
  state: string;
  lat: number;
  lng: number;
};

export const DE_CITIES: DeCity[] = [
  { name: "Berlin", state: "Berlin", lat: 52.52, lng: 13.405 },
  { name: "Hamburg", state: "Hamburg", lat: 53.551, lng: 9.993 },
  { name: "München", state: "Bayern", lat: 48.137, lng: 11.576 },
  { name: "Köln", state: "Nordrhein-Westfalen", lat: 50.938, lng: 6.96 },
  { name: "Frankfurt am Main", state: "Hessen", lat: 50.11, lng: 8.682 },
  { name: "Stuttgart", state: "Baden-Württemberg", lat: 48.776, lng: 9.177 },
  { name: "Düsseldorf", state: "Nordrhein-Westfalen", lat: 51.227, lng: 6.774 },
  { name: "Leipzig", state: "Sachsen", lat: 51.339, lng: 12.377 },
  { name: "Dortmund", state: "Nordrhein-Westfalen", lat: 51.514, lng: 7.465 },
  { name: "Essen", state: "Nordrhein-Westfalen", lat: 51.456, lng: 7.012 },
  { name: "Bremen", state: "Bremen", lat: 53.079, lng: 8.802 },
  { name: "Dresden", state: "Sachsen", lat: 51.05, lng: 13.738 },
  { name: "Hannover", state: "Niedersachsen", lat: 52.376, lng: 9.732 },
  { name: "Nürnberg", state: "Bayern", lat: 49.452, lng: 11.077 },
  { name: "Duisburg", state: "Nordrhein-Westfalen", lat: 51.434, lng: 6.762 },
  { name: "Bochum", state: "Nordrhein-Westfalen", lat: 51.482, lng: 7.216 },
  { name: "Wuppertal", state: "Nordrhein-Westfalen", lat: 51.256, lng: 7.151 },
  { name: "Bielefeld", state: "Nordrhein-Westfalen", lat: 52.03, lng: 8.532 },
  { name: "Bonn", state: "Nordrhein-Westfalen", lat: 50.737, lng: 7.098 },
  { name: "Münster", state: "Nordrhein-Westfalen", lat: 51.961, lng: 7.626 },
  { name: "Karlsruhe", state: "Baden-Württemberg", lat: 49.007, lng: 8.404 },
  { name: "Mannheim", state: "Baden-Württemberg", lat: 49.488, lng: 8.467 },
  { name: "Augsburg", state: "Bayern", lat: 48.371, lng: 10.898 },
  { name: "Wiesbaden", state: "Hessen", lat: 50.082, lng: 8.24 },
  { name: "Mönchengladbach", state: "Nordrhein-Westfalen", lat: 51.18, lng: 6.443 },
  { name: "Gelsenkirchen", state: "Nordrhein-Westfalen", lat: 51.518, lng: 7.086 },
  { name: "Aachen", state: "Nordrhein-Westfalen", lat: 50.776, lng: 6.084 },
  { name: "Braunschweig", state: "Niedersachsen", lat: 52.269, lng: 10.521 },
  { name: "Kiel", state: "Schleswig-Holstein", lat: 54.323, lng: 10.139 },
  { name: "Chemnitz", state: "Sachsen", lat: 50.833, lng: 12.924 },
  { name: "Halle (Saale)", state: "Sachsen-Anhalt", lat: 51.482, lng: 11.97 },
  { name: "Magdeburg", state: "Sachsen-Anhalt", lat: 52.131, lng: 11.64 },
  { name: "Freiburg im Breisgau", state: "Baden-Württemberg", lat: 47.999, lng: 7.842 },
  { name: "Krefeld", state: "Nordrhein-Westfalen", lat: 51.339, lng: 6.564 },
  { name: "Mainz", state: "Rheinland-Pfalz", lat: 49.998, lng: 8.273 },
  { name: "Lübeck", state: "Schleswig-Holstein", lat: 53.866, lng: 10.687 },
  { name: "Erfurt", state: "Thüringen", lat: 50.978, lng: 11.029 },
  { name: "Oberhausen", state: "Nordrhein-Westfalen", lat: 51.47, lng: 6.852 },
  { name: "Rostock", state: "Mecklenburg-Vorpommern", lat: 54.089, lng: 12.137 },
  { name: "Kassel", state: "Hessen", lat: 51.313, lng: 9.479 },
  { name: "Hagen", state: "Nordrhein-Westfalen", lat: 51.367, lng: 7.463 },
  { name: "Saarbrücken", state: "Saarland", lat: 49.24, lng: 6.997 },
  { name: "Hamm", state: "Nordrhein-Westfalen", lat: 51.681, lng: 7.815 },
  { name: "Potsdam", state: "Brandenburg", lat: 52.391, lng: 13.064 },
  { name: "Ludwigshafen", state: "Rheinland-Pfalz", lat: 49.477, lng: 8.435 },
  { name: "Oldenburg", state: "Niedersachsen", lat: 53.144, lng: 8.215 },
  { name: "Osnabrück", state: "Niedersachsen", lat: 52.279, lng: 8.047 },
  { name: "Leverkusen", state: "Nordrhein-Westfalen", lat: 51.032, lng: 6.984 },
  { name: "Heidelberg", state: "Baden-Württemberg", lat: 49.398, lng: 8.672 },
  { name: "Solingen", state: "Nordrhein-Westfalen", lat: 51.165, lng: 7.067 },
  { name: "Darmstadt", state: "Hessen", lat: 49.873, lng: 8.651 },
  { name: "Herne", state: "Nordrhein-Westfalen", lat: 51.538, lng: 7.219 },
  { name: "Regensburg", state: "Bayern", lat: 49.013, lng: 12.101 },
  { name: "Paderborn", state: "Nordrhein-Westfalen", lat: 51.719, lng: 8.754 },
  { name: "Neuss", state: "Nordrhein-Westfalen", lat: 51.204, lng: 6.688 },
  { name: "Ingolstadt", state: "Bayern", lat: 48.763, lng: 11.425 },
  { name: "Offenbach", state: "Hessen", lat: 50.101, lng: 8.766 },
  { name: "Ulm", state: "Baden-Württemberg", lat: 48.401, lng: 9.987 },
  { name: "Heilbronn", state: "Baden-Württemberg", lat: 49.143, lng: 9.211 },
  { name: "Pforzheim", state: "Baden-Württemberg", lat: 48.892, lng: 8.695 },
  { name: "Würzburg", state: "Bayern", lat: 49.794, lng: 9.929 },
  { name: "Wolfsburg", state: "Niedersachsen", lat: 52.423, lng: 10.787 },
  { name: "Göttingen", state: "Niedersachsen", lat: 51.533, lng: 9.935 },
  { name: "Bottrop", state: "Nordrhein-Westfalen", lat: 51.523, lng: 6.929 },
  { name: "Recklinghausen", state: "Nordrhein-Westfalen", lat: 51.614, lng: 7.198 },
  { name: "Reutlingen", state: "Baden-Württemberg", lat: 48.491, lng: 9.204 },
  { name: "Koblenz", state: "Rheinland-Pfalz", lat: 50.357, lng: 7.594 },
  { name: "Bremerhaven", state: "Bremen", lat: 53.54, lng: 8.581 },
  { name: "Erlangen", state: "Bayern", lat: 49.59, lng: 11.008 },
  { name: "Bergisch Gladbach", state: "Nordrhein-Westfalen", lat: 51.1, lng: 7.113 },
  { name: "Remscheid", state: "Nordrhein-Westfalen", lat: 51.179, lng: 7.194 },
  { name: "Jena", state: "Thüringen", lat: 50.927, lng: 11.586 },
  { name: "Trier", state: "Rheinland-Pfalz", lat: 49.75, lng: 6.637 },
  { name: "Moers", state: "Nordrhein-Westfalen", lat: 51.451, lng: 6.628 },
  { name: "Salzgitter", state: "Niedersachsen", lat: 52.15, lng: 10.333 },
  { name: "Siegen", state: "Nordrhein-Westfalen", lat: 50.875, lng: 8.024 },
  { name: "Hildesheim", state: "Niedersachsen", lat: 52.151, lng: 9.951 },
  { name: "Gütersloh", state: "Nordrhein-Westfalen", lat: 51.907, lng: 8.385 },
  { name: "Kaiserslautern", state: "Rheinland-Pfalz", lat: 49.443, lng: 7.771 },
  { name: "Schwerin", state: "Mecklenburg-Vorpommern", lat: 53.635, lng: 11.401 },
  { name: "Ludwigsburg", state: "Baden-Württemberg", lat: 48.897, lng: 9.192 },
  { name: "Esslingen", state: "Baden-Württemberg", lat: 48.74, lng: 9.307 },
  { name: "Gera", state: "Thüringen", lat: 50.878, lng: 12.082 },
  { name: "Iserlohn", state: "Nordrhein-Westfalen", lat: 51.376, lng: 7.699 },
  { name: "Düren", state: "Nordrhein-Westfalen", lat: 50.8, lng: 6.483 },
  { name: "Tübingen", state: "Baden-Württemberg", lat: 48.522, lng: 9.052 },
  { name: "Flensburg", state: "Schleswig-Holstein", lat: 54.782, lng: 9.437 },
  { name: "Zwickau", state: "Sachsen", lat: 50.719, lng: 12.496 },
  { name: "Gießen", state: "Hessen", lat: 50.584, lng: 8.678 },
  { name: "Ratingen", state: "Nordrhein-Westfalen", lat: 51.296, lng: 6.849 },
  { name: "Lünen", state: "Nordrhein-Westfalen", lat: 51.616, lng: 7.529 },
  { name: "Villingen-Schwenningen", state: "Baden-Württemberg", lat: 48.062, lng: 8.494 },
  { name: "Konstanz", state: "Baden-Württemberg", lat: 47.66, lng: 9.176 },
  { name: "Marl", state: "Nordrhein-Westfalen", lat: 51.656, lng: 7.085 },
  { name: "Worms", state: "Rheinland-Pfalz", lat: 49.632, lng: 8.357 },
  { name: "Velbert", state: "Nordrhein-Westfalen", lat: 51.34, lng: 7.043 },
  { name: "Minden", state: "Nordrhein-Westfalen", lat: 52.29, lng: 8.917 },
  { name: "Dessau-Roßlau", state: "Sachsen-Anhalt", lat: 51.83, lng: 12.23 },
  { name: "Neumünster", state: "Schleswig-Holstein", lat: 54.072, lng: 9.982 },
  { name: "Norderstedt", state: "Schleswig-Holstein", lat: 53.707, lng: 10.001 },
  { name: "Delmenhorst", state: "Niedersachsen", lat: 53.051, lng: 8.631 },
  { name: "Bamberg", state: "Bayern", lat: 49.898, lng: 10.891 },
  { name: "Bayreuth", state: "Bayern", lat: 49.946, lng: 11.571 },
  { name: "Celle", state: "Niedersachsen", lat: 52.623, lng: 10.081 },
  { name: "Aschaffenburg", state: "Bayern", lat: 49.977, lng: 9.152 },
  { name: "Landshut", state: "Bayern", lat: 48.537, lng: 12.151 },
  { name: "Kempten", state: "Bayern", lat: 47.727, lng: 10.313 },
  { name: "Rosenheim", state: "Bayern", lat: 47.856, lng: 12.129 },
  { name: "Friedrichshafen", state: "Baden-Württemberg", lat: 47.658, lng: 9.479 },
  { name: "Offenburg", state: "Baden-Württemberg", lat: 48.474, lng: 7.945 },
  { name: "Lüneburg", state: "Niedersachsen", lat: 53.249, lng: 10.414 },
  { name: "Marburg", state: "Hessen", lat: 50.802, lng: 8.766 },
  { name: "Fulda", state: "Hessen", lat: 50.555, lng: 9.68 },
  { name: "Stralsund", state: "Mecklenburg-Vorpommern", lat: 54.31, lng: 13.09 },
  { name: "Greifswald", state: "Mecklenburg-Vorpommern", lat: 54.096, lng: 13.388 },
  { name: "Wismar", state: "Mecklenburg-Vorpommern", lat: 53.892, lng: 11.466 },
  { name: "Cottbus", state: "Brandenburg", lat: 51.756, lng: 14.334 },
  { name: "Brandenburg an der Havel", state: "Brandenburg", lat: 52.412, lng: 12.532 },
  { name: "Frankfurt (Oder)", state: "Brandenburg", lat: 52.342, lng: 14.551 },
  { name: "Weimar", state: "Thüringen", lat: 50.979, lng: 11.329 },
  { name: "Eisenach", state: "Thüringen", lat: 50.975, lng: 10.319 },
  { name: "Passau", state: "Bayern", lat: 48.573, lng: 13.432 },
  { name: "Speyer", state: "Rheinland-Pfalz", lat: 49.317, lng: 8.431 },
  { name: "Neubrandenburg", state: "Mecklenburg-Vorpommern", lat: 53.56, lng: 13.261 },
];

export function normalizeCityQuery(q: string) {
  return q
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

export function searchDeCities(query: string, limit = 8): DeCity[] {
  const q = normalizeCityQuery(query);
  if (q.length < 2) return [];
  const scored = DE_CITIES.map((c) => {
    const n = normalizeCityQuery(c.name);
    const s = normalizeCityQuery(c.state);
    let score = 0;
    if (n === q) score = 100;
    else if (n.startsWith(q)) score = 80;
    else if (n.includes(q)) score = 50;
    else if (s.startsWith(q)) score = 20;
    return { c, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name, "de"));
  return scored.slice(0, limit).map((x) => x.c);
}

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type PlanStop = { id: string; lat: number; lng: number; street: string };

export type DayPlan = {
  day: number;
  stops: PlanStop[];
  meters: number;
};

/** Greedy nearest-neighbor, in Tagesportionen. Skaliert von 2 Gründern auf ganz Deutschland. */
export function planWorkdays(stops: PlanStop[], perDay: number, start?: { lat: number; lng: number }): DayPlan[] {
  const n = Math.max(1, Math.round(perDay) || 30);
  const leftover = [...stops];
  const days: DayPlan[] = [];
  let cursor = start || leftover[0] || { lat: 51.16, lng: 10.45 };
  while (leftover.length) {
    const dayStops: PlanStop[] = [];
    let meters = 0;
    for (let i = 0; i < n && leftover.length; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let j = 0; j < leftover.length; j++) {
        const d = haversineMeters(cursor, leftover[j]);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      const next = leftover.splice(best, 1)[0];
      meters += Number.isFinite(bestD) ? bestD : 0;
      dayStops.push(next);
      cursor = next;
    }
    days.push({ day: days.length + 1, stops: dayStops, meters: Math.round(meters) });
  }
  return days;
}

export function bboxAround(lat: number, lng: number, km = 2.2) {
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos((lat * Math.PI) / 180));
  return { south: lat - dLat, north: lat + dLat, west: lng - dLng, east: lng + dLng };
}

export const STREET_CAP = 400;
export const DEFAULT_STREETS_PER_DAY = 30;

export function bboxFromPoints(pts: { lat: number; lng: number }[]) {
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  return {
    south: Math.min(...lats),
    north: Math.max(...lats),
    west: Math.min(...lngs),
    east: Math.max(...lngs),
  };
}

/** Ray-casting. 3 Ecken = Dreieck, 4 Ecken = Rechteck/Viereck. */
export function pointInPolygon(p: { lat: number; lng: number }, ring: { lat: number; lng: number }[]) {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i]!.lat;
    const xi = ring[i]!.lng;
    const yj = ring[j]!.lat;
    const xj = ring[j]!.lng;
    const hit = yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi + 1e-12) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

export function uniqueStreets(stops: PlanStop[]): PlanStop[] {
  const map = new Map<string, PlanStop & { n: number; latSum: number; lngSum: number }>();
  for (const s of stops) {
    const key = s.street.trim().toLowerCase().replace(/\s+/g, " ");
    if (!key) continue;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...s, n: 1, latSum: s.lat, lngSum: s.lng });
    } else {
      prev.n += 1;
      prev.latSum += s.lat;
      prev.lngSum += s.lng;
    }
  }
  return [...map.values()].map((s) => ({
    id: s.id,
    street: s.street.trim(),
    lat: s.latSum / s.n,
    lng: s.lngSum / s.n,
  }));
}

export type HouseStop = PlanStop & { house: string };

/** Straßen A–Z, Hausnummern numerisch. Kein Laufweg. */
export function groupStreets(houses: HouseStop[]) {
  const groups = new Map<string, HouseStop[]>();
  for (const h of houses) {
    const key = h.street.trim().toLowerCase().replace(/\s+/g, " ") || "ohne name";
    const arr = groups.get(key) || [];
    arr.push(h);
    groups.set(key, arr);
  }
  return [...groups.values()]
    .map((hs) => {
      const housesSorted = [...hs].sort((a, b) => a.house.localeCompare(b.house, "de", { numeric: true }));
      return {
        street: hs[0]!.street.trim(),
        lat: hs.reduce((s, x) => s + x.lat, 0) / hs.length,
        lng: hs.reduce((s, x) => s + x.lng, 0) / hs.length,
        houses: housesSorted,
      };
    })
    .sort((a, b) => a.street.localeCompare(b.street, "de"));
}

function nnOrder<T extends { lat: number; lng: number }>(items: T[], start: { lat: number; lng: number }): T[] {
  const leftover = [...items];
  const ordered: T[] = [];
  let cursor = start;
  while (leftover.length) {
    let best = 0;
    let bestD = Infinity;
    for (let j = 0; j < leftover.length; j++) {
      const d = haversineMeters(cursor, leftover[j]!);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    const next = leftover.splice(best, 1)[0]!;
    ordered.push(next);
    cursor = next;
  }
  return ordered;
}

/** Straßen nacheinander, in jeder Straße die Häuser — ab Startpunkt. */
export function planHouseWalk(houses: HouseStop[], start: { lat: number; lng: number }) {
  const groups = new Map<string, HouseStop[]>();
  for (const h of houses) {
    const key = h.street.trim().toLowerCase().replace(/\s+/g, " ") || "ohne name";
    const arr = groups.get(key) || [];
    arr.push(h);
    groups.set(key, arr);
  }
  const streets = [...groups.values()].map((hs) => ({
    street: hs[0]!.street,
    lat: hs.reduce((s, x) => s + x.lat, 0) / hs.length,
    lng: hs.reduce((s, x) => s + x.lng, 0) / hs.length,
    houses: hs,
  }));
  const leftover = [...streets];
  const out: Array<{ street: string; houses: HouseStop[]; meters: number }> = [];
  let cursor: { lat: number; lng: number } = start;
  let total = 0;
  while (leftover.length) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < leftover.length; i++) {
      const d = haversineMeters(cursor, leftover[i]!);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const st = leftover.splice(best, 1)[0]!;
    const ordered = nnOrder(st.houses, cursor);
    let meters = Number.isFinite(bestD) ? bestD : 0;
    for (let i = 1; i < ordered.length; i++) meters += haversineMeters(ordered[i - 1]!, ordered[i]!);
    total += meters;
    out.push({ street: st.street, houses: ordered, meters: Math.round(meters) });
    cursor = ordered.at(-1) || cursor;
  }
  return { streets: out, meters: Math.round(total), count: houses.length };
}

export type WalkPlan = ReturnType<typeof planHouseWalk>;

export function applyWalkOrder(
  walk: WalkPlan,
  order: Array<{ street: string; houses?: string[] }>,
): WalkPlan {
  const map = new Map(walk.streets.map((s) => [s.street.trim().toLowerCase(), { ...s, houses: [...s.houses] }]));
  const streets: WalkPlan["streets"] = [];
  for (const item of order) {
    const key = item.street.trim().toLowerCase();
    const s = map.get(key);
    if (!s) continue;
    map.delete(key);
    if (item.houses?.length) {
      const byNr = new Map(s.houses.map((h) => [h.house, h]));
      const ordered = item.houses.map((nr) => byNr.get(nr)).filter(Boolean) as typeof s.houses;
      for (const h of s.houses) if (!item.houses.includes(h.house)) ordered.push(h);
      s.houses = ordered;
    }
    streets.push(s);
  }
  for (const s of map.values()) streets.push(s);
  let total = 0;
  const withM = streets.map((s) => {
    let meters = 0;
    for (let i = 1; i < s.houses.length; i++) meters += haversineMeters(s.houses[i - 1]!, s.houses[i]!);
    total += meters;
    return { ...s, meters: Math.round(meters) };
  });
  return { streets: withM, meters: Math.round(total), count: withM.reduce((n, s) => n + s.houses.length, 0) };
}
