import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Navigation, Search, X } from "lucide-react";
import { getTerritoryWalk, logFieldVisit, openFieldObject, searchFieldAddress } from "@/lib/server/field-api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  addOverlayLayers,
  boundsOf,
  createE1Map,
  loadMapLibre,
  setGeojson,
  type MapLibreMap,
} from "@/lib/map-gl";

type Hit = Awaited<ReturnType<typeof searchFieldAddress>>[number];
type Obj = Awaited<ReturnType<typeof openFieldObject>>;
type Walk = Awaited<ReturnType<typeof getTerritoryWalk>>;

export function FieldRouter({ center }: { center: { lat: number; lng: number } }) {
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Array<{ remove: () => void }>>([]);
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
      await loadMapLibre();
      if (cancelled || !ref.current || mapRef.current) return;
      const map = createE1Map(ref.current, center, 15, { controls: false });
      mapRef.current = map;
      map.on("load", () => {
        map.resize();
        addOverlayLayers(map);
        void loadWalk();
      });
      map.on("click", (e) => {
        if (!e?.lngLat) return;
        if (tapStartRef.current) {
          tapStartRef.current = false;
          setTapStart(false);
          void loadWalk(e.lngLat.lat, e.lngLat.lng);
          return;
        }
        void pick({
          lat: e.lngLat.lat,
          lng: e.lngLat.lng,
          street: "",
          house: "",
          zip: "",
          city: "",
          display: "",
        });
      });
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
    const map = mapRef.current;
    if (!map?.getSource("e1-zone")) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    const ring = data.ring;
    setGeojson(map, "e1-zone", {
      type: "FeatureCollection",
      features:
        ring.length >= 3
          ? [
              {
                type: "Feature",
                geometry: {
                  type: "Polygon",
                  coordinates: [[...ring.map((p) => [p.lng, p.lat]), [ring[0]!.lng, ring[0]!.lat]]],
                },
                properties: {},
              },
            ]
          : [],
    });
    const linePts = data.walk.streets.flatMap((s) => s.houses.map((h) => [h.lng, h.lat] as [number, number]));
    setGeojson(map, "e1-route", {
      type: "FeatureCollection",
      features:
        linePts.length >= 2
          ? [{ type: "Feature", geometry: { type: "LineString", coordinates: linePts }, properties: {} }]
          : [],
    });
    setGeojson(map, "e1-points", {
      type: "FeatureCollection",
      features: data.houses.map((h, i) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [h.lng, h.lat] },
        properties: { kind: i === 0 ? "start" : "pt" },
      })),
    });
    const ML = window.maplibregl;
    if (ML && data.houses.length <= 280) {
      for (const h of data.houses) {
        const el = document.createElement("span");
        el.className = "e1-hn";
        el.textContent = h.house;
        el.onclick = (ev) => {
          ev.stopPropagation();
          void pick({
            lat: h.lat,
            lng: h.lng,
            street: h.street,
            house: h.house,
            zip: "",
            city: "",
            display: `${h.street} ${h.house}`,
          });
        };
        const mk = new ML.Marker({ element: el }).setLngLat([h.lng, h.lat]).addTo(map);
        markersRef.current.push(mk);
      }
    }
    const b = boundsOf(ring.length >= 3 ? ring : data.houses);
    if (b) {
      try {
        map.fitBounds(b, { padding: 40, maxZoom: 18, duration: 500 });
      } catch {
        /* */
      }
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
    mapRef.current?.jumpTo({ center: [h.lng, h.lat], zoom: h.house || h.street ? 18 : 15 });
    const concrete = Boolean((h.house || "").trim() || (h.street || "").trim());
    if (!concrete) {
      setObj(null);
      setHouse("");
      toast.message("Karte auf den Ort. Für Abschluss Straße und Hausnummer suchen oder ein Haus antippen.");
      return;
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
      <p className="pointer-events-none absolute bottom-24 left-3 right-3 z-[1100] text-center text-[11px] text-gold/90">
        Zwei Finger nach oben ziehen — Häuser stehen in 3D
      </p>

      <div className="absolute left-3 right-3 top-3 z-[1200] grid gap-2">
        <div className="overflow-hidden rounded-xl bg-white text-[#1a1a1a] shadow-lg">
          <div className="flex items-center gap-2 px-3">
            <Search className="size-4 text-[#c9a227]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Straße und Hausnummer"
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
                  if (h) mapRef.current?.jumpTo({ center: [h.lng, h.lat], zoom: 18 });
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
                  to: "/app/abschluss",
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
