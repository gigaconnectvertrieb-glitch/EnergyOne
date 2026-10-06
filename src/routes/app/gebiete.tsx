import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FieldMap } from "@/components/field-map";
import { assignTerritory, deleteTerritory, listTerritories, uploadTerritory } from "@/lib/server/field-api";

export const Route = createFileRoute("/app/gebiete")({ component: Page });

type Point = { lat: number; lng: number };
type Door = { street: string; house: string; lat: number; lng: number; kind: "efh" | "mfh" | "unsicher" };
type Hit = { display_name: string; lat: string; lon: string; geojson?: { type: string; coordinates: unknown }; addresstype?: string };

function ring(points: Point[]) {
  if (points.length < 3) return null;
  const hull = points.slice();
  return [...hull, hull[0]];
}
function inside(door: Door, poly: Point[]) {
  let n = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i].lat, yj = poly[j].lat, xi = poly[i].lng, xj = poly[j].lng;
    if ((yi > door.lat) !== (yj > door.lat) && door.lng < ((xj - xi) * (door.lat - yi)) / (yj - yi) + xi) n = !n;
  }
  return n;
}

function Page() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [street, setStreet] = useState<Hit | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [doors, setDoors] = useState<Door[]>([]);
  const [name, setName] = useState("Neues Gebiet");
  const [userId, setUserId] = useState("");
  const [rows, setRows] = useState<Array<{ id: string; name: string; door_count?: number; first_name?: string; last_name?: string }>>([]);
  const [note, setNote] = useState("Straße suchen, Punkte setzen, Häuser lesen, dann aufspielen.");
  const center = street ? { lat: Number(street.lat), lng: Number(street.lon) } : points[0] || { lat: 49.98, lng: 8.83 };

  async function reload() {
    const list = await listTerritories().catch(() => []);
    setRows(list as typeof rows);
  }
  useEffect(() => { void reload(); }, []);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setNote("Suche …");
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&polygon_geojson=1&countrycodes=de&limit=5&q=${encodeURIComponent(q)}`);
    const found = await res.json() as Hit[];
    setHits(found);
    setStreet(found[0] || null);
    setNote(found[0] ? found[0].display_name : "Nichts gefunden");
  }

  async function readHouses() {
    if (points.length < 3) { setNote("Mindestens drei Punkte."); return; }
    const lats = points.map((p) => p.lat), lngs = points.map((p) => p.lng);
    const query = `[out:json][timeout:25];way["building"](${Math.min(...lats)},${Math.min(...lngs)},${Math.max(...lats)},${Math.max(...lngs)});out center tags;`;
    setNote("Häuser werden gelesen …");
    const res = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: `data=${encodeURIComponent(query)}` });
    const data = await res.json();
    const found: Door[] = [];
    for (const el of data.elements || []) {
      const tags = el.tags || {};
      const door = { street: tags["addr:street"] || "Ohne Straße", house: tags["addr:housenumber"] || "?", lat: el.center?.lat, lng: el.center?.lon, kind: tags.building === "apartments" || Number(tags["building:flats"] || 0) > 1 ? "mfh" as const : tags.building === "house" ? "efh" as const : "unsicher" as const };
      if (!door.lat || !inside(door, points)) continue;
      found.push(door);
    }
    found.sort((a, b) => a.street.localeCompare(b.street, "de") || a.house.localeCompare(b.house, "de", { numeric: true }));
    setDoors(found);
    setNote(`${found.length} Häuser in der Fläche. Unsicher bleibt unsicher.`);
  }

  async function saveArea() {
    const features = doors.map((d) => ({ type: "Feature", geometry: { type: "Point", coordinates: [d.lng, d.lat] }, properties: { street: d.street, house: d.house, kind: d.kind } }));
    const text = JSON.stringify({ type: "FeatureCollection", features });
    const created = await uploadTerritory({ data: { name, filename: "gebiet.geojson", text, userId: userId || undefined } });
    setNote(`Aufgespielt: ${name}`);
    if (userId && created && typeof created === "object" && "id" in created) await assignTerritory({ data: { id: String(created.id), userId } });
    setPoints([]); setDoors([]);
    await reload();
  }

  return (
    <div className="grid gap-3 p-3">
      <h1 className="text-xl font-semibold">Gebietsverwaltung</h1>
      <p className="text-sm text-muted-foreground">{note}</p>
      <form className="flex gap-2" onSubmit={search}>
        <input className="min-h-11 flex-1 rounded-xl border px-3" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Waldstraße Rödermark" />
        <button className="rounded-xl bg-primary px-3 text-primary-foreground" type="submit">Suchen</button>
      </form>
      {street?.addresstype !== "city" && street ? <p className="text-sm text-red-500">Rot markiert: {street.display_name}</p> : null}
      <div className="h-80 overflow-hidden rounded-2xl">
        <FieldMap center={center} corners={points} draw onTap={(p) => setPoints((old) => [...old, p])} />
      </div>
      <div className="flex gap-2">
        <button className="rounded-xl border px-3" type="button" onClick={() => setPoints((p) => p.slice(0, -1))}>Punkt zurück</button>
        <button className="rounded-xl border px-3" type="button" onClick={() => { setPoints([]); setStreet(null); }}>Highlight löschen</button>
        <button className="rounded-xl border px-3" type="button" onClick={readHouses}>Häuser lesen</button>
      </div>
      <p>{points.length} Punkte · {doors.length} Häuser</p>
      <input className="min-h-11 rounded-xl border px-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="Gebietsname" />
      <input className="min-h-11 rounded-xl border px-3" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="Mitarbeiter-ID, leer lässt es bei dir" />
      <button className="min-h-11 rounded-xl bg-primary text-primary-foreground" type="button" onClick={saveArea}>Gebiet aufspielen</button>
      <div className="grid gap-2">
        {rows.map((row) => (
          <div className="flex items-center justify-between rounded-xl border p-3" key={row.id}>
            <span>{row.name}<br /><small>{row.door_count || 0} Häuser · {row.first_name || ""} {row.last_name || ""}</small></span>
            <button type="button" onClick={() => deleteTerritory({ data: { id: row.id } }).then(reload)}>Löschen</button>
          </div>
        ))}
      </div>
      {ring(points) ? null : null}
    </div>
  );
}
