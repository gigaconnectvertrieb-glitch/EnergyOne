import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { logFieldVisit, openFieldObject, searchFieldAddress } from "@/lib/server/field-api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Hit = Awaited<ReturnType<typeof searchFieldAddress>>[number];
type Obj = Awaited<ReturnType<typeof openFieldObject>>;

export function FieldRouter({ center }: { center: { lat: number; lng: number } }) {
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ setView: (ll: [number, number], z: number) => void; remove: () => void } | null>(null);
  const pinRef = useRef<{ remove: () => void } | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [obj, setObj] = useState<Obj | null>(null);
  const [house, setHouse] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      await loadLeaflet();
      if (cancelled || !ref.current || mapRef.current) return;
      const L = (window as unknown as { L: LeafletNS }).L;
      const map = L.map(ref.current, { zoomControl: false, preferCanvas: true });
      map.setView([center.lat, center.lng], 7);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "OSM",
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        void pick({ lat: e.latlng.lat, lng: e.latlng.lng, street: "", house: "", zip: "", city: "", display: "" });
      });
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [center.lat, center.lng]);

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

  function dropPin(lat: number, lng: number) {
    const L = (window as unknown as { L: LeafletNS }).L;
    const map = mapRef.current;
    if (!L || !map) return;
    pinRef.current?.remove();
    const m = L.circleMarker([lat, lng], {
      radius: 8,
      color: "#0b0d12",
      weight: 2,
      fillColor: "#c9a227",
      fillOpacity: 1,
    });
    m.addTo(map);
    pinRef.current = m;
    map.setView([lat, lng], 18);
  }

  async function pick(h: Partial<Hit> & { lat: number; lng: number }) {
    setBusy(true);
    setHits([]);
    dropPin(h.lat, h.lng);
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

  const selectedHouse = obj?.houses.find((x) => x.house === house);

  return (
    <div className="relative -mx-4 -mt-3 h-[calc(100dvh-7.5rem)] min-h-[28rem] overflow-hidden bg-[#d4e0d4]">
      <div ref={ref} className="absolute inset-0" />

      <div className="absolute left-3 right-3 top-3 z-[1200]">
        <div className="overflow-hidden rounded-xl bg-white text-[#1a1a1a] shadow-lg">
          <div className="flex items-center gap-2 px-3">
            <Search className="size-4 text-[#c9a227]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ort, PLZ und Straße eingeben"
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
      </div>

      {obj ? (
        <div className="absolute bottom-3 left-3 right-3 z-[1200] rounded-2xl bg-white p-4 text-[#1a1a1a] shadow-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#c9a227]">Objekt</p>
          <h2 className="mt-1 font-display text-2xl text-[#111]">
            {obj.street || "Adresse"} {house}
          </h2>
          <p className="text-sm text-[#555]">
            {[obj.zip, obj.city].filter(Boolean).join(" ")}
          </p>
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
                  if (h) dropPin(h.lat, h.lng);
                }}
              >
                {obj.houses.map((h) => (
                  <option key={h.house} value={h.house}>
                    {h.house}
                    {h.street && h.street !== obj.street ? ` · ${h.street}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <p className={cn("mt-3 text-sm font-medium", obj.inTerritory ? "text-[#3f8f6b]" : "text-[#c45c4a]")}>
            {obj.inTerritory
              ? obj.territoryName
                ? `Im Gebiet · ${obj.territoryName}`
                : "Kein festes Teamgebiet — frei"
              : `Außerhalb des Teamgebiets${obj.territoryName ? ` (${obj.territoryName})` : ""}`}
          </p>
          {obj.customers.length ? (
            <p className="mt-1 text-xs text-[#666]">
              Bekannte Kunden: {obj.customers.map((c) => c.name).join(", ")}
            </p>
          ) : (
            <p className="mt-1 text-xs text-[#666]">Kein E1-Kunde an dieser Adresse.</p>
          )}
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
                toast.success("Nicht angetroffen — Nachlauf");
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
      ) : null}
    </div>
  );
}

type LeafletNS = {
  map: (el: HTMLElement, o: unknown) => {
    setView: (ll: [number, number], z: number) => void;
    on: (ev: string, fn: (e: { latlng: { lat: number; lng: number } }) => void) => void;
    remove: () => void;
  };
  tileLayer: (u: string, o: unknown) => { addTo: (m: unknown) => void };
  circleMarker: (ll: [number, number], o: unknown) => { addTo: (m: unknown) => void; remove: () => void };
};

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
