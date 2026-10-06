import { useEffect, useState } from "react";
import { FieldMap } from "@/components/field-map";
import { assignTerritory, uploadTerritory } from "@/lib/server/field-api";
import { listUsers } from "@/lib/server/api";
import { toast } from "sonner";

type Point = { lat: number; lng: number };
type Door = { street: string; house: string; lat: number; lng: number; kind: "efh" | "mfh" | "unsicher" };
type Hit = { display_name: string; lat: string; lon: string; addresstype?: string; geojson?: { type: string; coordinates: unknown } };
type User = { user_id: string; first_name?: string; last_name?: string };

function lineOf(hit: Hit | null): Point[] {
  const geo = hit?.geojson;
  if (!geo || geo.type !== "LineString" || !Array.isArray(geo.coordinates)) return [];
  return (geo.coordinates as number[][]).map(([lng, lat]) => ({ lat, lng }));
}
function inside(door: Door, poly: Point[]) {
  let n = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i].lat, yj = poly[j].lat, xi = poly[i].lng, xj = poly[j].lng;
    if ((yi > door.lat) !== (yj > door.lat) && door.lng < ((xj - xi) * (door.lat - yi)) / (yj - yi) + xi) n = !n;
  }
  return n;
}

export function StreetManager() {
  const [q, setQ] = useState("");
  const [street, setStreet] = useState<Hit | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [doors, setDoors] = useState<Door[]>([]);
  const [name, setName] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState("");
  const line = lineOf(street);
  const center = street ? { lat: Number(street.lat), lng: Number(street.lon) } : points[0] || { lat: 49.98, lng: 8.83 };

  useEffect(() => { listUsers().then((rows) => setUsers(rows as User[])).catch(() => setUsers([])); }, []);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setBusy("Suche");
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&polygon_geojson=1&countrycodes=de&limit=1&q=${encodeURIComponent(q)}`);
    const [hit] = await res.json() as Hit[];
    setStreet(hit || null);
    setPoints([]);
    setDoors([]);
    setName(hit ? hit.display_name.split(",")[0] : "");
    setBusy("");
    if (!hit) toast.error("Straße nicht gefunden");
  }

  async function addPoint(p: Point) {
    const query = `[out:json][timeout:12];way["building"](around:28,${p.lat},${p.lng});out center tags;`;
    const res = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: `data=${encodeURIComponent(query)}` }).catch(() => null);
    const data = res ? await res.json() : { elements: [] };
    const el = data.elements?.[0];
    const lat = el?.center?.lat || p.lat;
    const lng = el?.center?.lon || p.lng;
    setPoints((old) => [...old, { lat, lng }]);
  }

  async function readHouses() {
    if (points.length < 3) return toast.error("Mindestens drei Punkte auf der Karte");
    setBusy("Häuser");
    const lats = points.map((p) => p.lat), lngs = points.map((p) => p.lng);
    const query = `[out:json][timeout:25];way["building"](${Math.min(...lats)},${Math.min(...lngs)},${Math.max(...lats)},${Math.max(...lngs)});out center tags;`;
    const res = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: `data=${encodeURIComponent(query)}` });
    const data = await res.json();
    const found: Door[] = [];
    for (const el of data.elements || []) {
      const tags = el.tags || {};
      const door: Door = { street: tags["addr:street"] || "Ohne Straße", house: tags["addr:housenumber"] || "?", lat: el.center?.lat, lng: el.center?.lon, kind: tags.building === "apartments" || Number(tags["building:flats"] || 0) > 1 ? "mfh" : tags.building === "house" || tags.building === "detached" ? "efh" : "unsicher" };
      if (!door.lat || !inside(door, points)) continue;
      found.push(door);
    }
    found.sort((a, b) => a.street.localeCompare(b.street, "de") || a.house.localeCompare(b.house, "de", { numeric: true }));
    setDoors(found);
    setBusy("");
    toast.success(`${found.length} Häuser, unsichere bleiben unsicher`);
  }

  async function save() {
    if (!doors.length) return toast.error("Zuerst Häuser lesen");
    setBusy("Speichern");
    const features = doors.map((d) => ({ type: "Feature", geometry: { type: "Point", coordinates: [d.lng, d.lat] }, properties: { street: d.street, house: d.house, kind: d.kind } }));
    const created = await uploadTerritory({ data: { name: name || "Gebiet", filename: "gebiet.geojson", text: JSON.stringify({ type: "FeatureCollection", features }), userId: userId || undefined } });
    const id = created && typeof created === "object" && "id" in created ? String(created.id) : "";
    if (id && userId) await assignTerritory({ data: { id, userId } });
    setBusy("");
    setPoints([]);
    setDoors([]);
    toast.success(userId ? "Gebiet aufgespielt und zugewiesen" : "Gebiet aufgespielt");
  }

  return (
    <section className="rounded-3xl border border-gold/40 p-4">
      <h2 className="text-lg font-semibold">Gebietsmanager</h2>
      <p className="text-sm text-muted-foreground">Eine Planung. Straße, Fläche, Häuser, Mitarbeiter.</p>
      <form className="mt-3 flex gap-2" onSubmit={search}>
        <input className="min-h-11 flex-1 rounded-xl border bg-transparent px-3" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Waldstraße Rödermark" />
        <button className="rounded-xl bg-gold px-3 text-bg" type="submit">Suchen</button>
      </form>
      {street ? <p className="mt-2 text-sm text-red-400">{line.length ? "Straße geladen" : "Ort geladen"}: {street.display_name}</p> : null}
      <div className="mt-3 h-96 overflow-hidden rounded-2xl">
        <FieldMap center={center} corners={points.length ? points : line.slice(0, 80)} stops={doors.map((d) => ({ id: `${d.street}-${d.house}`, street: d.street, house: d.house, lat: d.lat, lng: d.lng }))} draw onTap={addPoint} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="rounded-xl border px-3 py-2" type="button" onClick={() => setPoints((p) => p.slice(0, -1))}>Punkt zurück</button>
        <button className="rounded-xl border px-3 py-2" type="button" onClick={() => { setPoints([]); setStreet(null); setDoors([]); }}>Markierung löschen</button>
        <button className="rounded-xl border px-3 py-2" type="button" onClick={readHouses}>Häuser lesen</button>
      </div>
      <p className="mt-2 text-sm">{busy || `${points.length} Punkte · ${doors.length} Häuser`}</p>
      <div className="mt-2 max-h-40 overflow-auto text-sm">
        {doors.slice(0, 30).map((d) => <div key={`${d.street}-${d.house}-${d.lat}`}>{d.street} {d.house} · {d.kind}</div>)}
      </div>
      <input className="mt-2 min-h-11 w-full rounded-xl border bg-transparent px-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="Gebietsname" />
      <select className="mt-2 min-h-11 w-full rounded-xl border bg-transparent px-3" value={userId} onChange={(e) => setUserId(e.target.value)}>
        <option value="">Nicht zuweisen</option>
        {users.map((u) => <option key={u.user_id} value={u.user_id}>{u.first_name} {u.last_name}</option>)}
      </select>
      <button className="mt-2 rounded-xl bg-gold px-3 py-2 text-bg" type="button" onClick={save}>Aufspielen</button>
    </section>
  );
}
