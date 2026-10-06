import { useState } from "react";
import { FieldMap } from "@/components/field-map";
import { uploadTerritory } from "@/lib/server/field-api";
import { toast } from "sonner";

type Point = { lat: number; lng: number };
type Door = { street: string; house: string; lat: number; lng: number; kind: string };
type Hit = { display_name: string; lat: string; lon: string; addresstype?: string };

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
  const [name, setName] = useState("Neues Gebiet");
  const center = street ? { lat: Number(street.lat), lng: Number(street.lon) } : points[0] || { lat: 49.98, lng: 8.83 };

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&polygon_geojson=1&countrycodes=de&limit=1&q=${encodeURIComponent(q)}`);
    const [hit] = await res.json() as Hit[];
    setStreet(hit || null);
    if (!hit) toast.error("Nichts gefunden");
  }

  async function readHouses() {
    if (points.length < 3) return toast.error("Mindestens drei Punkte");
    const lats = points.map((p) => p.lat), lngs = points.map((p) => p.lng);
    const query = `[out:json][timeout:25];way["building"](${Math.min(...lats)},${Math.min(...lngs)},${Math.max(...lats)},${Math.max(...lngs)});out center tags;`;
    const res = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: `data=${encodeURIComponent(query)}` });
    const data = await res.json();
    const found: Door[] = [];
    for (const el of data.elements || []) {
      const tags = el.tags || {};
      const door = { street: tags["addr:street"] || "Ohne Straße", house: tags["addr:housenumber"] || "?", lat: el.center?.lat, lng: el.center?.lon, kind: tags.building === "apartments" ? "mfh" : tags.building === "house" ? "efh" : "unsicher" };
      if (!door.lat || !inside(door, points)) continue;
      found.push(door);
    }
    setDoors(found);
    toast.success(`${found.length} Häuser gelesen`);
  }

  async function save() {
    const features = doors.map((d) => ({ type: "Feature", geometry: { type: "Point", coordinates: [d.lng, d.lat] }, properties: { street: d.street, house: d.house, kind: d.kind } }));
    await uploadTerritory({ data: { name, filename: "gebiet.geojson", text: JSON.stringify({ type: "FeatureCollection", features }) } });
    toast.success("Gebiet aufgespielt");
    setPoints([]);
    setDoors([]);
  }

  return (
    <section className="mb-6 rounded-3xl border border-gold/40 p-4">
      <h2 className="text-lg font-semibold">Gebietsmanager</h2>
      <p className="text-sm text-muted-foreground">Straße suchen, Punkte auf die Karte setzen, Häuser lesen, aufspielen.</p>
      <form className="mt-3 flex gap-2" onSubmit={search}>
        <input className="min-h-11 flex-1 rounded-xl border bg-transparent px-3" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Waldstraße Rödermark" />
        <button className="rounded-xl bg-gold px-3 text-bg" type="submit">Suchen</button>
      </form>
      {street ? <p className="mt-2 text-sm text-red-400">Straße: {street.display_name}</p> : null}
      <div className="mt-3 h-80 overflow-hidden rounded-2xl">
        <FieldMap center={center} corners={points} draw onTap={(p) => setPoints((old) => [...old, p])} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="rounded-xl border px-3 py-2" type="button" onClick={() => setPoints((p) => p.slice(0, -1))}>Punkt zurück</button>
        <button className="rounded-xl border px-3 py-2" type="button" onClick={() => { setPoints([]); setStreet(null); }}>Markierung löschen</button>
        <button className="rounded-xl border px-3 py-2" type="button" onClick={readHouses}>Häuser lesen</button>
      </div>
      <p className="mt-2 text-sm">{points.length} Punkte · {doors.length} Häuser</p>
      <input className="mt-2 min-h-11 w-full rounded-xl border bg-transparent px-3" value={name} onChange={(e) => setName(e.target.value)} />
      <button className="mt-2 rounded-xl bg-gold px-3 py-2 text-bg" type="button" onClick={save}>Aufspielen</button>
    </section>
  );
}
