import { useEffect, useRef, useState } from "react";
import { createGoogleMap, googleMapsKey, loadGoogleMaps, type GoogleMap } from "@/lib/map-google";
import { assignTerritory, downloadTerritory, listSavedDoors, listTerritories, readAreaHouses, uploadTerritory } from "@/lib/server/field-api";
import { listUsers } from "@/lib/server/api";
import { planTerritoryAgent, readStreetHouses } from "@/lib/server/territory-agent";
import { toast } from "sonner";

type Point = { lat: number; lng: number };
type Door = { street: string; house: string; lat: number; lng: number; kind: "efh" | "mfh" | "unsicher" };
type Hit = { display_name: string; lat: string; lon: string; geojson?: { type: string; coordinates: number[][] } };
type User = { user_id: string; first_name?: string; last_name?: string };
type Overlay = { setMap: (m: GoogleMap | null) => void };

function lineOf(hit: Hit | null): Point[] {
  const geo = hit?.geojson;
  if (!geo || geo.type !== "LineString" || !Array.isArray(geo.coordinates)) return [];
  return geo.coordinates.map(([lng, lat]) => ({ lat, lng }));
}
function inside(door: Door, poly: Point[]) {
  let n = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i].lat, yj = poly[j].lat, xi = poly[i].lng, xj = poly[j].lng;
    if ((yi > door.lat) !== (yj > door.lat) && door.lng < ((xj - xi) * (door.lat - yi)) / (yj - yi) + xi) n = !n;
  }
  return n;
}

export function StreetManager() /* deploy-marker: ganze-strasse */ {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const overlays = useRef<Overlay[]>([]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [street, setStreet] = useState<Hit | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [doors, setDoors] = useState<Door[]>([]);
  const [name, setName] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [areas, setAreas] = useState<{ id: string; name: string }[]>([]);
  const [areaId, setAreaId] = useState("");
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState("");
  const pointsRef = useRef(points);
  pointsRef.current = points;

  function clearOverlays() {
    overlays.current.forEach((item) => item.setMap(null));
    overlays.current = [];
  }
  function draw() {
    const map = mapRef.current;
    const g = window.google?.maps as unknown as {
      Polyline: new (o: Record<string, unknown>) => Overlay;
      Polygon: new (o: Record<string, unknown>) => Overlay;
      Marker: new (o: Record<string, unknown>) => Overlay;
    } | undefined;
    if (!map || !g) return;
    clearOverlays();
    const line = lineOf(street);
    if (line.length > 1) overlays.current.push(new g.Polyline({ map, path: line, strokeColor: "#d4a017", strokeWeight: 6 }));
    if (points.length > 2) overlays.current.push(new g.Polygon({ map, paths: points, strokeColor: "#d4a017", strokeWeight: 2, fillColor: "#d4a017", fillOpacity: 0.16 }));
    points.forEach((p) => overlays.current.push(new g.Marker({ map, position: p })));
    doors.forEach((d) => overlays.current.push(new g.Marker({ map, position: d, label: d.kind === "mfh" ? "M" : d.kind === "efh" ? "E" : "?" })));
  }

  useEffect(() => { listUsers().then((rows) => setUsers(rows as User[])).catch(() => setUsers([])); listTerritories().then((rows) => setAreas((rows as { id: string; name: string }[]).map((r) => ({ id: r.id, name: r.name })))).catch(() => setAreas([])); }, []);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let gone = false;
    void loadGoogleMaps(googleMapsKey()).then(() => {
      if (gone || mapRef.current) return;
      const map = createGoogleMap(el, { lat: 49.98, lng: 8.83 });
      mapRef.current = map;
      window.google?.maps.event.addListener(map, "click", (e: { latLng: { lat: () => number; lng: () => number } }) => {
        setPoints((old) => [...old, { lat: e.latLng.lat(), lng: e.latLng.lng() }]);
      });
    }).catch(() => toast.error("Google Maps nicht geladen"));
    return () => { gone = true; };
  }, []);
  useEffect(() => { draw(); }, [street, points, doors]);
  useEffect(() => {
    if (q.trim().length < 3) { setHits([]); return; }
    const timer = setTimeout(() => {
      fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&polygon_geojson=1&countrycodes=de&limit=6&q=${encodeURIComponent(q)}`)
        .then((res) => res.json()).then((rows: Hit[]) => setHits(rows)).catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  function choose(hit: Hit) {
    setStreet(hit);
    setHits([]);
    setQ(hit.display_name);
    setName(hit.display_name.split(",")[0]);
    setPoints([]);
    setDoors([]);
    mapRef.current?.setCenter({ lat: Number(hit.lat), lng: Number(hit.lon) });
    mapRef.current?.setZoom(17);
  }
  function clearMark() {
    setStreet(null);
    setPoints([]);
    setDoors([]);
    setQ("");
    clearOverlays();
  }
  async function readHouses() {
    if (pointsRef.current.length < 3) { setBusy("Mindestens drei Punkte auf die Karte tippen"); return; }
    setBusy("Häuser werden gelesen");
    const pts = pointsRef.current;
    const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
    const south = Math.min(...lats), west = Math.min(...lngs), north = Math.max(...lats), east = Math.max(...lngs);
    const data = await readAreaHouses({ data: { south, west, north, east } }).catch(() => ({ elements: [] }));
    const addresses = (data.elements || []).filter((el) => el.tags?.["addr:housenumber"]).map((el) => ({ street: el.tags["addr:street"] || name, house: el.tags["addr:housenumber"], lat: el.lat || el.center?.lat, lng: el.lon || el.center?.lon }));
    const saved = await listSavedDoors().catch(() => []);
    const found: Door[] = (saved as { street: string; house: string; lat: number; lng: number }[])
      .filter((d) => d.lat && inside({ ...d, kind: "unsicher" }, pts))
      .map((d) => ({ street: d.street, house: d.house, lat: Number(d.lat), lng: Number(d.lng), kind: "unsicher" as const }));
    for (const el of data.elements || []) {
      if (!el.tags?.building) continue;
      const lat = el.center?.lat, lng = el.center?.lon;
      if (!lat || !inside({ lat, lng, street: "", house: "", kind: "unsicher" }, pts)) continue;
      if (found.some((d) => Math.hypot((d.lat - lat) * 111000, (d.lng - lng) * 70000) < 12)) continue;
      const near = addresses.filter((a) => a.lat && Math.hypot((a.lat - lat) * 111000, (a.lng - lng) * 70000) < 35).sort((a, b) => Math.hypot(a.lat - lat, a.lng - lng) - Math.hypot(b.lat - lat, b.lng - lng))[0];
      const tags = el.tags || {};
      found.push({ street: tags["addr:street"] || near?.street || name || "Ohne Straße", house: tags["addr:housenumber"] || near?.house || "ohne Nr.", lat, lng, kind: tags.building === "apartments" || Number(tags["building:levels"] || 0) >= 3 || Number(tags["building:flats"] || 0) > 1 ? "mfh" : tags.building === "house" || tags.building === "detached" || tags.building === "semidetached_house" ? "efh" : "unsicher" });
    }
    setDoors([...found]);
    setBusy(`${found.length} Häuser gelesen`);
    const cache = JSON.parse(localStorage.getItem("e1-address-cache") || "{}") as Record<string, { street: string; house: string }>;
    const Geocoder = (window.google?.maps as unknown as { Geocoder?: new () => { geocode: (o: { location: Point }) => Promise<{ results: { address_components: { types: string[]; long_name: string }[] }[] }> } }).Geocoder;
    if (!Geocoder) return;
    const geocoder = new Geocoder();
    for (const door of found.filter((d) => d.house === "ohne Nr.").slice(0, 40)) {
      const key = `${door.lat.toFixed(5)},${door.lng.toFixed(5)}`;
      const saved = cache[key];
      if (saved) { door.street = saved.street; door.house = saved.house; continue; }
      const hit = await geocoder.geocode({ location: door }).catch(() => null);
      const parts = hit?.results?.[0]?.address_components || [];
      const house = parts.find((p) => p.types.includes("street_number"))?.long_name;
      const street = parts.find((p) => p.types.includes("route"))?.long_name;
      if (!house) continue;
      door.house = house;
      if (street) door.street = street;
      cache[key] = { street: door.street, house: door.house };
    }
    localStorage.setItem("e1-address-cache", JSON.stringify(cache));
    found.sort((a, b) => a.street.localeCompare(b.street, "de") || a.house.localeCompare(b.house, "de", { numeric: true }));
    const route: Door[] = [];
    for (const street of [...new Set(found.map((d) => d.street))]) {
      const side = found.filter((d) => d.street === street);
      const odd = side.filter((d) => Number.parseInt(d.house, 10) % 2 === 1);
      const even = side.filter((d) => Number.parseInt(d.house, 10) % 2 === 0).reverse();
      route.push(...odd, ...even);
    }
    found.splice(0, found.length, ...route);
    try {
      const path: Point[] = [];
      const service = new (window.google?.maps as unknown as { DirectionsService: new () => { route: (o: Record<string, unknown>) => Promise<{ routes: { overview_path: Point[] }[] }> } }).DirectionsService();
      for (let i = 0; i < found.length - 1; i += 20) {
        const chunk = found.slice(i, i + 21);
        const result = await service.route({ origin: chunk[0], destination: chunk[chunk.length - 1], waypoints: chunk.slice(1, -1).map((d) => ({ location: d, stopover: true })), travelMode: "WALKING" }).catch(() => null);
        path.push(...(result?.routes?.[0]?.overview_path || []));
      }
      if (path.length > 1) {
        const g = window.google?.maps as unknown as { Polyline: new (o: Record<string, unknown>) => Overlay };
        overlays.current.push(new g.Polyline({ map: mapRef.current, path, strokeColor: "#1a73e8", strokeWeight: 4 }));
      }
    } catch {
      /* Route darf das Speichern nicht abbrechen */
    }
    setDoors(found);
    setBusy(found.length ? `${found.length} Häuser gelesen` : "Keine Häuser in der Fläche");
  }
  async function propose() {
    const place = q.trim();
    if (place.length < 3) { setBusy("Ort oder Straße nennen"); return; }
    setBusy("Agent sucht das Gebiet");
    const planned = await planTerritoryAgent({ data: { place } });
    if (!planned.ok) { setBusy(planned.reason); return; }
    const hit = { display_name: planned.display_name, lat: planned.lat, lon: planned.lon } as Hit;
    choose(hit);
    const lat = Number(hit.lat), lng = Number(hit.lon);
    setPoints([
      { lat: lat + 0.0012, lng: lng - 0.0016 },
      { lat: lat + 0.0012, lng: lng + 0.0016 },
      { lat: lat - 0.0012, lng: lng + 0.0016 },
      { lat: lat - 0.0012, lng: lng - 0.0016 },
    ]);
    setBusy("Gebiet vorgeschlagen, Häuser werden gelesen");
  }
  async function wholeStreet() {
    if (!street) { setBusy("Zuerst eine Straße wählen"); return; }
    setBusy("Ganze Straße wird gelesen");
    const rows = await readStreetHouses({ data: { street: street.display_name.split(",")[0], lat: Number(street.lat), lng: Number(street.lon) } });
    const doors = (rows as Door[]).sort((a, b) => a.house.localeCompare(b.house, "de", { numeric: true }));
    const odd = doors.filter((d) => Number.parseInt(d.house, 10) % 2 === 1);
    const even = doors.filter((d) => Number.parseInt(d.house, 10) % 2 === 0).reverse();
    setDoors([...odd, ...even].map((d) => ({ ...d, kind: "unsicher" })));
    setName(street.display_name.split(",")[0]);
    setBusy(`${doors.length} Häuser, Laufroute gesetzt`);
  }
  async function openSaved(id: string) {
    setAreaId(id);
    if (!id) return;
    setBusy("Gespeicherte Häuser werden geladen");
    const file = await downloadTerritory({ data: { id } });
    const json = JSON.parse(file.geojson) as { features: { geometry: { type: string; coordinates: number[] }; properties: { street?: string; house?: string } }[] };
    const loaded = json.features.filter((f) => f.geometry?.type === "Point").map((f) => ({ street: f.properties.street || "", house: f.properties.house || "", lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], kind: "unsicher" as const }));
    setDoors(loaded);
    setName(file.name);
    if (loaded[0]) mapRef.current?.setCenter(loaded[0]);
    setBusy(`${loaded.length} gespeicherte Häuser`);
  }
  async function save() {
    if (!doors.length) return toast.error("Zuerst Häuser lesen");
    setBusy("Speichern");
    const features = doors.map((d, i) => ({ type: "Feature", geometry: { type: "Point", coordinates: [d.lng, d.lat] }, properties: { street: d.street, house: d.house, kind: d.kind, stop: i + 1, note: `Halt ${String(i + 1).padStart(3, "0")}` } }));
    try {
      const created = await uploadTerritory({ data: { name: name || "Gebiet", filename: "gebiet.geojson", text: JSON.stringify({ type: "FeatureCollection", features }), userId: userId || undefined } });
      const id = created && typeof created === "object" && "id" in created ? String(created.id) : "";
      if (id && userId) await assignTerritory({ data: { id, userId } });
      setBusy(id ? "Gebiet gespeichert" : "Speichern ohne Bestätigung");
      toast.success(userId ? "Gebiet aufgespielt und zugewiesen" : "Gebiet aufgespielt");
    } catch (err) {
      setBusy(err instanceof Error ? err.message : "Gebiet nicht gespeichert");
    }
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">Planung</p>
      <h2 className="mt-1 font-serif text-3xl">Gebiet setzen</h2>
      <p className="mt-1 text-sm text-muted-foreground">Straße wählen, goldene Markierung, Punkte setzen, Häuser lesen, zuweisen.</p>
      <select className="mt-4 min-h-12 w-full rounded-full border border-white/10 bg-black/30 px-4" value={areaId} onChange={(e) => void openSaved(e.target.value)}><option value="">Gespeichertes Gebiet wählen</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      <input className="mt-2 min-h-12 w-full rounded-full border border-white/10 bg-black/30 px-4" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Waldstraße Rödermark" />
      {hits.length ? <div className="mt-2 overflow-hidden rounded-2xl border border-white/10">{hits.map((hit) => <button key={`${hit.lat}-${hit.lon}`} className="block w-full border-b border-white/10 px-4 py-3 text-left text-sm last:border-0" type="button" onClick={() => choose(hit)}>{hit.display_name}</button>)}</div> : null}
      <div ref={host} className="mt-4 h-[28rem] overflow-hidden rounded-3xl border border-white/10" />
      <div className="relative z-20 mt-3 flex flex-wrap gap-2">
        <button className="min-h-11 rounded-full border border-white/10 px-4" type="button" onClick={() => setPoints((p) => p.slice(0, -1))}>Punkt zurück</button>
        <button className="min-h-11 rounded-full border border-white/10 px-4" type="button" onClick={clearMark}>Markierung löschen</button>
        <button className="min-h-11 rounded-full border border-white/10 px-4" type="button" onClick={() => void propose()}>Gebiet vorschlagen</button>
        <button className="min-h-11 rounded-full bg-gold px-4 font-medium text-bg" type="button" onClick={() => void readHouses().catch(() => setBusy(doors.length ? `${doors.length} Häuser bleiben sichtbar` : "Lesen nicht möglich"))}>Häuser lesen</button>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{busy || `${points.length} Punkte · ${doors.length} Häuser · ${street ? "Straße markiert" : "keine Straße"}`}</p>
      <div className="mt-2 max-h-40 space-y-1 overflow-auto text-sm">
        {doors.slice(0, 40).map((d) => <div key={`${d.street}-${d.house}-${d.lat}`}>{d.street} {d.house} · {d.kind === "mfh" ? "Mehrfamilie" : d.kind === "efh" ? "Einfamilie" : "unsicher"}</div>)}
      </div>
      <input className="mt-3 min-h-12 w-full rounded-full border border-white/10 bg-black/30 px-4" value={name} onChange={(e) => setName(e.target.value)} placeholder="Gebietsname" />
      <select className="mt-2 min-h-12 w-full rounded-full border border-white/10 bg-black/30 px-4" value={userId} onChange={(e) => setUserId(e.target.value)}>
        <option value="">Mitarbeiter wählen</option>
        {users.map((u) => <option key={u.user_id} value={u.user_id}>{u.first_name} {u.last_name}</option>)}
      </select>
      <button className="mt-3 min-h-12 rounded-full bg-gold px-5 font-medium text-bg" type="button" onClick={save}>Aufspielen</button>
    </section>
  );
}
