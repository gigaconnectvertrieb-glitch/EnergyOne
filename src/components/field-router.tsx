import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Navigation, Search, X } from "lucide-react";
import { getTerritoryWalk, logFieldVisit, openFieldObject, searchFieldAddress } from "@/lib/server/field-api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CARTO_ATTR, CARTO_VOYAGER } from "@/lib/map-tiles";

type Hit = Awaited<ReturnType<typeof searchFieldAddress>>[number];
type Obj = Awaited<ReturnType<typeof openFieldObject>>;
type Walk = Awaited<ReturnType<typeof getTerritoryWalk>>;

export function FieldRouter({ center }: { center: { lat: number; lng: number } }) {
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{
    setView: (ll: [number, number], z: number) => void;
    fitBounds: (b: unknown, o?: unknown) => void;
    remove: () => void;
  } | null>(null);
  const layerRef = useRef<{ remove: () => void }[]>([]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [obj, setObj] = useState<Obj | null>(null);
  const [house, setHouse] = useState("");
  const [busy, setBusy] = useState(false);
  const [pack, setPack] = useState<Walk | null>(null);
  const [tapStart, setTapStart] = useState(false);
  const tapStartRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      await loadLeaflet();
      if (cancelled || !ref.current || mapRef.current) return;
      const L = (window as unknown as { L: LeafletNS }).L;
      const map = L.map(ref.current, { zoomControl: false, preferCanvas: true });
      map.setView([center.lat, center.lng], 12);
      L.tileLayer(CARTO_VOYAGER, {
        attribution: CARTO_ATTR,
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        if (tapStartRef.current) {
          tapStartRef.current = false;
          setTapStart(false);
          void loadWalk(e.latlng.lat, e.latlng.lng);
          return;
        }
        void pick({ lat: e.latlng.lat, lng: e.latlng.lng, street: "", house: "", zip: "", city: "", display: "" });
      });
      void loadWalk();
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [center.lat, center.lng]);

  async function loadWalk(lat?: number, lng?: number) {
    setBusy(true);
    try {
      const next = await getTerritoryWalk({ data: { lat, lng } });
      setPack(next);
      paint(next);
      if (lat && lng) toast.success("Laufweg neu berechnet");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gebiet nicht geladen");
    } finally {
      setBusy(false);
    }
  }

  function paint(data: Walk) {
    const L = (window as unknown as { L: LeafletNS }).L;
    const map = mapRef.current;
    if (!L || !map) return;
    layerRef.current.forEach((x) => x.remove());
    layerRef.current = [];
    if (data.ring.length >= 3) {
      const poly = L.polygon(
        data.ring.map((p) => [p.lat, p.lng] as [number, number]),
        { color: "#c9a227", weight: 3, fillColor: "#c9a227", fillOpacity: 0.12 },
      );
      poly.addTo(map);
      layerRef.current.push(poly);
      try {
        map.fitBounds(poly.getBounds(), { padding: [28, 28], maxZoom: 18 });
      } catch {
        /* */
      }
    }
    const linePts = data.walk.streets.flatMap((s) => s.houses.map((h) => [h.lat, h.lng] as [number, number]));
    if (linePts.length >= 2) {
      const line = L.polyline(linePts, { color: "#c9a227", weight: 3, opacity: 0.9 });
      line.addTo(map);
      layerRef.current.push(line);
    }
    for (const h of data.houses) {
      const icon = L.divIcon({
        className: "e1-hn",
        html: `<span>${escapeHtml(h.house)}</span>`,
        iconSize: [26, 16],
        iconAnchor: [13, 8],
      });
      const m = L.marker([h.lat, h.lng], { icon, keyboard: false });
      m.bindTooltip(`${h.street} ${h.house}`, { direction: "top" });
      m.on("click", () => {
        void pick({ lat: h.lat, lng: h.lng, street: h.street, house: h.house, zip: "", city: "", display: `${h.street} ${h.house}` });
      });
      m.addTo(map);
      layerRef.current.push(m);
    }
  }

  useEffect(() => {
    if (q.trim().length < 5) {
      setHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      searchFieldAddress({ data: { q } })
        .then(setHits)
        .catch(() => setHits([]));
    }, 280);
    return () => window.clearTimeout(t);
  }, [q]);

  async function pick(h: Partial<Hit> & { lat: number; lng: number }) {
    setHits([]);
    const L = (window as unknown as { L: LeafletNS }).L;
    mapRef.current?.setView([h.lat, h.lng], 18);
    if (L && mapRef.current) {
      const m = L.circleMarker([h.lat, h.lng], {
        radius: 8,
        color: "#fff",
        weight: 2,
        fillColor: "#c9a227",
        fillOpacity: 1,
      });
      m.addTo(mapRef.current);
      layerRef.current.push(m);
    }
    setBusy(true);
    try {
      const next = await openFieldObject({
        data: { lat: h.lat, lng: h.lng, street: h.street, house: h.house, zip: h.zip, city: h.city },
      });
      setObj(next);
      setHouse(h.house || next.house || next.houses[0]?.house || "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Objekt nicht geladen");
    } finally {
      setBusy(false);
    }
  }

  function gpsStart() {
    navigator.geolocation.getCurrentPosition(
      (pos) => void loadWalk(pos.coords.latitude, pos.coords.longitude),
      () => toast.error("Standort nicht verfügbar — Start auf der Karte antippen."),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  const selectedHouse = obj?.houses.find((x) => x.house === house);

  return (
    <div className="relative -mx-4 -mt-3 h-[calc(100dvh-7.5rem)] min-h-[28rem] overflow-hidden bg-[#d4e0d4]">
      <div ref={ref} className="absolute inset-0" />

      <div className="absolute left-3 right-3 top-3 z-[1200] grid gap-2">
        <div className="overflow-hidden rounded-xl bg-white text-[#1a1a1a] shadow-lg">
          <div className="flex items-center gap-2 px-3">
            <Search className="size-4 text-[#c9a227]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ort, PLZ und Straße"
              className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none"
            />
            {q ? (
              <button type="button" onClick={() => { setQ(""); setHits([]); }} aria-label="Leeren">
                <X className="size-4" />
              </button>
            ) : null}
          </div>
          {hits.length ? (
            <ul className="max-h-56 overflow-auto border-t border-black/8">
              {hits.map((h) => (
                <li key={`${h.lat}-${h.lng}-${h.display}`}>
                  <button
                    type="button"
                    className="flex min-h-12 w-full items-start px-3 py-2 text-left text-sm hover:bg-black/4"
                    onClick={() => {
                      setQ(h.display);
                      void pick(h);
                    }}
                  >
                    {h.display}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={gpsStart}
            className="flex h-10 items-center gap-1.5 rounded-full bg-[#0b0d12] px-3 text-xs text-gold"
          >
            <Navigation className="size-3.5" /> Start hier
          </button>
          <button
            type="button"
            onClick={() => {
              tapStartRef.current = true;
              setTapStart(true);
              toast.message("Nächster Tipp auf der Karte = Start");
            }}
            className={cn("h-10 rounded-full bg-white px-3 text-xs text-[#111] shadow", tapStart && "ring-2 ring-[#c9a227]")}
          >
            Start antippen
          </button>
        </div>
      </div>

      {obj ? (
        <div className="absolute bottom-3 left-3 right-3 z-[1200] rounded-2xl bg-white p-4 text-[#1a1a1a] shadow-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#c9a227]">Objekt</p>
          <h2 className="mt-1 font-display text-2xl text-[#111]">
            {obj.street || "Adresse"} {house}
          </h2>
          <p className="text-sm text-[#555]">{[obj.zip, obj.city].filter(Boolean).join(" ")}</p>
          {obj.houses.length ? (
            <label className="mt-3 block text-xs text-[#666]">
              Hausnummer
              <select
                className="mt-1 h-11 w-full rounded-lg border border-black/15 bg-white px-2"
                value={house}
                onChange={(e) => {
                  const v = e.target.value;
                  setHouse(v);
                  const h = obj.houses.find((x) => x.house === v);
                  if (h) mapRef.current?.setView([h.lat, h.lng], 18);
                }}
              >
                {obj.houses.map((h) => (
                  <option key={h.house} value={h.house}>
                    {h.house}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <p className={cn("mt-3 text-sm font-medium", obj.inTerritory ? "text-[#3f8f6b]" : "text-[#c45c4a]")}>
            {obj.inTerritory ? "Im Teamgebiet" : "Außerhalb des Teamgebiets"}
            {pack?.name ? ` · ${pack.name}` : ""}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="border-black/15 text-[#111]"
              disabled={busy}
              onClick={async () => {
                await logFieldVisit({
                  data: {
                    reason: "nicht_angetroffen",
                    street: obj.street,
                    house,
                    zip: obj.zip,
                    city: obj.city,
                    lat: selectedHouse?.lat ?? obj.lat,
                    lng: selectedHouse?.lng ?? obj.lng,
                  },
                });
                toast.success("Nicht angetroffen");
              }}
            >
              Nicht angetroffen
            </Button>
            <Button
              onClick={() =>
                nav({
                  to: "/portal/auftraege/neu",
                  search: { street: obj.street, house, zip: obj.zip, city: obj.city },
                })
              }
            >
              Abschluss
            </Button>
          </div>
        </div>
      ) : pack && pack.walk.count ? (
        <p className="absolute bottom-3 left-3 z-[1200] rounded-full bg-[#0b0d12]/90 px-3 py-2 text-xs text-gold">
          {pack.walk.count} Häuser · {(pack.walk.meters / 1000).toFixed(1)} km Laufweg
        </p>
      ) : null}
    </div>
  );
}

type LeafletNS = {
  map: (el: HTMLElement, o: unknown) => {
    setView: (ll: [number, number], z: number) => void;
    fitBounds: (b: unknown, o?: unknown) => void;
    on: (ev: string, fn: (e: { latlng: { lat: number; lng: number } }) => void) => void;
    remove: () => void;
  };
  tileLayer: (u: string, o: unknown) => { addTo: (m: unknown) => void };
  polygon: (ll: [number, number][], o: unknown) => {
    addTo: (m: unknown) => void;
    remove: () => void;
    getBounds: () => unknown;
  };
  polyline: (ll: [number, number][], o: unknown) => { addTo: (m: unknown) => void; remove: () => void };
  divIcon: (o: unknown) => unknown;
  marker: (ll: [number, number], o: unknown) => {
    addTo: (m: unknown) => void;
    remove: () => void;
    bindTooltip: (s: string, o?: unknown) => void;
    on: (ev: string, fn: () => void) => void;
  };
  circleMarker: (ll: [number, number], o: unknown) => {
    addTo: (m: unknown) => void;
    remove: () => void;
    bindTooltip: (s: string, o?: unknown) => void;
    on: (ev: string, fn: () => void) => void;
  };
};

function escapeHtml(s: string) {
  const amp = "&" + "amp;";
  const lt = "&" + "lt;";
  const gt = "&" + "gt;";
  const quot = "&" + "#34;";
  return s.replace(/&/g, amp).replace(/</g, lt).replace(/>/g, gt).replace(/"/g, quot);
}

let leafletPromise: Promise<void> | null = null;
function loadLeaflet() {
  if ((window as unknown as { L?: unknown }).L) return Promise.resolve();
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Karte nicht geladen"));
    document.body.appendChild(s);
  });
  return leafletPromise;
}
