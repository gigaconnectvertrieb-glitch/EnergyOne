import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Navigation, Search, X } from "lucide-react";
import { acceptTerritory, getFieldHome, getTerritoryWalk, logFieldVisit, openFieldObject, requestTerritoryAccess, searchFieldAddress } from "@/lib/server/field-api";
import { BuildingPanel } from "@/components/building-panel";
import { cachePack, isOffline, queueVisit, readPack } from "@/lib/offline-queue";
import { cn } from "@/lib/utils";
import {
  addOverlayLayers,
  boundsOf,
  createE1Map,
  loadMapLibre,
  setGeojson,
  type MapLibreMap,
} from "@/lib/map-gl";
import { createGoogleMap, googleMapsKey, loadGoogleMaps, type GoogleMap } from "@/lib/map-google";

type Hit = Awaited<ReturnType<typeof searchFieldAddress>>[number];
type Obj = Awaited<ReturnType<typeof openFieldObject>>;
type Walk = Awaited<ReturnType<typeof getTerritoryWalk>>;

export function FieldRouter({ center, planner = false }: { center: { lat: number; lng: number }; planner?: boolean }) {
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const gRef = useRef<GoogleMap | null>(null);
  const gMarkers = useRef<Array<{ setMap: (m: null) => void }>>([]);
  const markersRef = useRef<Array<{ remove: () => void }>>([]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [obj, setObj] = useState<Obj | null>(null);
  const [house, setHouse] = useState("");
  const [busy, setBusy] = useState(false);
  const [pack, setPack] = useState<Walk | null>(null);
  const [offer, setOffer] = useState<{ id: string; name: string } | null>(null);
  const [pano, setPano] = useState<{ lat: number; lng: number } | null>(null);
  const tapStartRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const key = googleMapsKey();
      if (key && ref.current && !gRef.current && !mapRef.current) {
        try {
          await loadGoogleMaps(key);
          if (cancelled || !ref.current) return;
          const gmap = createGoogleMap(ref.current, center);
          gRef.current = gmap;
          window.google?.maps.event.addListener(gmap, "click", (e) => {
            const lat = e.latLng.lat();
            const lng = e.latLng.lng();
            if (tapStartRef.current) {
              tapStartRef.current = false;
              setTapStart(false);
              void loadWalk(lat, lng);
              return;
            }
            void pick({ lat, lng, street: "", house: "", zip: "", city: "", display: "" });
          });
          void loadWalk();
          return;
        } catch {
          /* OSM */
        }
      }
      await loadMapLibre();
      if (cancelled || !ref.current || mapRef.current) return;
      const map = createE1Map(ref.current, center, 12, { controls: false });
      mapRef.current = map;
      const resize = () => map.resize();
      window.setTimeout(resize, 200);
      window.setTimeout(resize, 800);
      navigator.geolocation.getCurrentPosition(
        (pos) => map.jumpTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 16 }),
        () => {},
        { maximumAge: 60000, timeout: 5000 },
      );
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

  useEffect(() => {
    let live = true;
    async function poll() {
      try {
        const home = await getFieldHome();
        if (!live) return;
        if (home.pending) setOffer(home.pending);
      } catch {
        /* */
      }
    }
    void poll();
    const t = window.setInterval(() => void poll(), 8000);
    return () => {
      live = false;
      window.clearInterval(t);
    };
  }, []);

  async function loadWalk(lat?: number, lng?: number) {
    setBusy(true);
    try {
      if (isOffline()) {
        const cached = await readPack<Walk>("walk");
        if (cached) {
          setPack(cached);
          paint(cached);
          toast.message("Gebiet vom Gerät (kein Netz)");
          return;
        }
      }
      const next = await getTerritoryWalk({ data: { lat, lng } });
      setPack(next);
      paint(next);
      await cachePack("walk", next);
      if (lat && lng) toast.success("Laufweg neu berechnet");
    } catch (e) {
      const cached = await readPack<Walk>("walk");
      if (cached) {
        setPack(cached);
        paint(cached);
        toast.message("Gebiet vom Gerät");
      } else toast.error(e instanceof Error ? e.message : "Gebiet nicht geladen");
    } finally {
      setBusy(false);
    }
  }

  function paint(data: Walk) {
    const gmap = gRef.current;
    if (gmap && window.google?.maps) {
      gMarkers.current.forEach((m) => m.setMap(null));
      gMarkers.current = [];
      for (const h of data.houses.slice(0, 400)) {
        const mk = new window.google.maps.Marker({
          map: gmap,
          position: { lat: h.lat, lng: h.lng },
          label: { text: h.house, color: "#0B0D12", fontSize: "10px" },
          title: `${h.street} ${h.house}`,
        });
        mk.addListener("click", () => {
          void pick({
            lat: h.lat,
            lng: h.lng,
            street: h.street,
            house: h.house,
            zip: h.zip || "",
            city: h.city || "",
            display: `${h.street} ${h.house}`,
          });
        });
        gMarkers.current.push(mk);
      }
      if (data.houses[0]) {
        gmap.setCenter({ lat: data.houses[0].lat, lng: data.houses[0].lng });
        gmap.setZoom(18);
        gmap.setTilt(67.5);
      }
      return;
    }
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
            zip: h.zip || "",
            city: h.city || "",
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
    let on = true;
    async function tick() {
      try {
        const home = await getFieldHome();
        if (on) setOffer(home.pending || null);
      } catch {
        /* */
      }
    }
    void tick();
    const id = window.setInterval(tick, 8000);
    return () => {
      on = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (q.trim().length < 3) {
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
    if (h.house) {
      mapRef.current?.jumpTo({ center: [h.lng, h.lat], zoom: 18 });
      gRef.current?.setCenter({ lat: h.lat, lng: h.lng });
      gRef.current?.setZoom(18);
      gRef.current?.setTilt(67.5);
    } else if (!h.street) {
      mapRef.current?.jumpTo({ center: [h.lng, h.lat], zoom: 15 });
    }
    if (!(h.street || "").trim() && !(h.house || "").trim()) {
      setObj(null);
      setHouse("");
      toast.message("Straße mit dazu, dann kommen die Hausnummern.");
      return;
    }
    setBusy(true);
    try {
      const next = await openFieldObject({
        data: { lat: h.lat, lng: h.lng, street: h.street, house: h.house, zip: h.zip, city: h.city },
      });
      setObj(next);
      setHouse(h.house || next.house || "");
      if (!h.house && next.houses.length) {
        const lats = next.houses.map((x) => x.lat);
        const lngs = next.houses.map((x) => x.lng);
        try {
          mapRef.current?.fitBounds(
            [
              [Math.min(...lngs), Math.min(...lats)],
              [Math.max(...lngs), Math.max(...lats)],
            ],
            { padding: 50, maxZoom: 18, duration: 500 },
          );
        } catch {
          /* */
        }
        gRef.current?.setCenter({ lat: next.houses[0].lat, lng: next.houses[0].lng });
        gRef.current?.setZoom(17);
      }
      toast.success(next.street ? `${next.street} geloggt` : "Straße geladen");
      if (next.street) {
        setPano({ lat: next.houses[0]?.lat || h.lat, lng: next.houses[0]?.lng || h.lng });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Straße nicht geladen");
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
    <div className="relative -mx-4 -mt-3 h-[calc(100dvh-7.5rem)] min-h-[28rem] overflow-hidden bg-[#1a1c16]">
      <div ref={ref} className="absolute inset-0" />
      {pano ? (
        <div className="absolute inset-0 z-[1150]">
          <iframe
            title="Street View"
            className="h-full w-full border-0"
            allow="accelerometer; gyroscope; geolocation"
            src={
              googleMapsKey()
                ? `https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(googleMapsKey())}&location=${pano.lat},${pano.lng}&heading=90&pitch=0&fov=80`
                : `https://maps.google.com/maps?q=&layer=c&cbll=${pano.lat},${pano.lng}&cbp=11,0,0,0,0&output=embed`
            }
          />
          <button
            type="button"
            className="absolute right-3 top-3 z-[1160] rounded-full bg-[#0b0d12] px-3 py-2 text-xs text-gold"
            onClick={() => setPano(null)}
          >
            Karte
          </button>
        </div>
      ) : null}
      <p className="pointer-events-none absolute bottom-24 left-3 right-3 z-[1100] text-center text-[11px] text-gold/90">
        Zwei Finger nach oben ziehen — Häuser stehen in 3D
      </p>

      <div className="absolute left-3 right-3 top-3 z-[1200] grid gap-2">
        {offer ? (
          <div className="rounded-2xl bg-[#0b0d12] p-4 text-ink shadow-xl gold-hairline">
            <p className="text-[11px] uppercase tracking-[0.2em] text-gold">Neues Gebiet</p>
            <p className="mt-1 text-sm">{offer.name}</p>
            <Button
              className="mt-3 w-full"
              onClick={async () => {
                try {
                  await acceptTerritory({ data: { id: offer.id } });
                  setOffer(null);
                  await loadWalk();
                  toast.success("Gebiet liegt auf der Karte");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Nicht geladen");
                }
              }}
            >
              Gebiet herunterladen
            </Button>
          </div>
        ) : null}
        <button
          type="button"
          disabled={busy}
          className="h-12 rounded-xl bg-gold text-sm font-medium text-bg shadow-lg"
          onClick={async () => {
            try {
              if (offer) {
                await acceptTerritory({ data: { id: offer.id } });
                setOffer(null);
              }
              await loadWalk();
              toast.success("Straßen geladen");
              const first = pack?.walk.streets[0]?.houses[0];
              if (first) {
                void pick({
                  lat: first.lat,
                  lng: first.lng,
                  street: pack?.walk.streets[0]?.street,
                  house: first.house,
                  zip: first.zip || "",
                  city: first.city || "",
                  display: `${pack?.walk.streets[0]?.street} ${first.house}`,
                });
              }
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Kein Gebiet");
            }
          }}
        >
          {busy ? "Lädt…" : "Gebiet herunterladen"}
        </button>
        {planner ? (
        <div className="overflow-hidden rounded-xl bg-white text-[#1a1a1a] shadow-lg">
          <div className="flex items-center gap-2 px-3">
            <Search className="size-4 text-[#c9a227]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Stadt und Straße anschauen"
              className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none"
            />
            {q ? (
              <button type="button" onClick={() => { setQ(""); setHits([]); }} aria-label="Leeren">
                <X className="size-4" />
              </button>
            ) : null}
          </div>
          {hits.length ? (
            <ul className="max-h-40 overflow-auto border-t border-black/8">
              {hits.map((h) => (
                <li key={`${h.lat}-${h.lng}-${h.display}`}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-start px-3 py-2 text-left text-sm"
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
        ) : null}
        {pack?.walk.streets.length ? (
          <div className="max-h-28 overflow-auto rounded-xl bg-white/95 p-2 text-[#111] shadow">
            <p className="px-1 text-[10px] uppercase tracking-widest text-[#888]">Straßen im Gebiet</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {pack.walk.streets.map((s) => (
                <button
                  key={s.street}
                  type="button"
                  className="rounded-full bg-black/5 px-2 py-1 text-xs"
                  onClick={() => {
                    const first = s.houses[0];
                    if (!first) return;
                    const lats = s.houses.map((h) => h.lat);
                    const lngs = s.houses.map((h) => h.lng);
                    if (mapRef.current && lats.length) {
                      try {
                        mapRef.current.fitBounds(
                          [
                            [Math.min(...lngs), Math.min(...lats)],
                            [Math.max(...lngs), Math.max(...lats)],
                          ],
                          { padding: 50, maxZoom: 18, duration: 500 },
                        );
                      } catch {
                        mapRef.current.jumpTo({ center: [first.lng, first.lat], zoom: 17 });
                      }
                    }
                    gRef.current?.setCenter({ lat: first.lat, lng: first.lng });
                    gRef.current?.setZoom(s.houses.length > 8 ? 17 : 18);
                    void pick({
                      lat: first.lat,
                      lng: first.lng,
                      street: s.street,
                      house: first.house,
                      zip: first.zip || "",
                      city: first.city || "",
                      display: `${s.street} ${first.house}`,
                    });
                  }}
                >
                  {s.street}
                </button>
              ))}
            </div>
          </div>
        ) : null}
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
            {obj.street || "Straße"} {house}
          </h2>
          <p className="text-sm text-[#555]">{[obj.zip, obj.city].filter(Boolean).join(" ")}</p>
          {obj.houses.length ? (
            <div className="mt-3">
              <p className="text-xs text-[#666]">Hausnummer antippen</p>
              <div className="mt-2 flex max-h-36 flex-wrap gap-2 overflow-auto">
                {obj.houses.map((h) => (
                  <button
                    key={h.house}
                    type="button"
                    className={cn(
                      "min-h-10 min-w-10 rounded-lg border px-2 text-sm",
                      house === h.house ? "border-[#c9a227] bg-[#c9a227] text-[#111]" : "border-black/15 bg-white text-[#111]",
                    )}
                    onClick={() => {
                      setHouse(h.house);
                      mapRef.current?.jumpTo({ center: [h.lng, h.lat], zoom: 18 });
                      gRef.current?.setCenter({ lat: h.lat, lng: h.lng });
                      gRef.current?.setZoom(18);
                      gRef.current?.setTilt(67.5);
                    }}
                  >
                    {h.house}
                    {h.units ? <span className="ml-1 text-[10px] opacity-70">{h.units} WE</span> : null}
                  </button>
                ))}
              </div>
              {selectedHouse && "units" in selectedHouse && selectedHouse.units ? (
                <p className="mt-2 text-xs text-[#555]">{selectedHouse.units} Wohneinheiten (OSM)</p>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-[#666]">Keine Hausnummern in OSM. Nummer selbst eintragen.</p>
          )}
          <p className={cn("mt-3 text-sm font-medium", obj.inTerritory ? "text-[#3f8f6b]" : "text-[#c45c4a]")}>
            {obj.inTerritory ? "Im Teamgebiet" : "Außerhalb des Teamgebiets"}
            {pack?.name ? ` · ${pack.name}` : ""}
          </p>
          <p className="mt-2 text-sm text-[#333]">
            Wohneinheiten: {selectedHouse && "units" in selectedHouse && selectedHouse.units ? selectedHouse.units : "—"}
          </p>
          <p className="text-xs text-[#666]">Provision erscheint am Haus, sobald der Tarifrechner die API hat.</p>
          <BuildingPanel street={obj.street} house={house || obj.house} zip={obj.zip} city={obj.city} />
          <a
            className="mt-2 inline-block text-xs text-[#1a73e8]"
            href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${selectedHouse?.lat ?? obj.lat},${selectedHouse?.lng ?? obj.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            Street View
          </a>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {planner || obj.inTerritory ? (
              <>
            <Button
              variant="outline"
              className="border-black/15 text-[#111]"
              disabled={busy}
              onClick={async () => {
                const payload = {
                  reason: "nicht_angetroffen" as const,
                  street: obj.street,
                  house,
                  zip: obj.zip,
                  city: obj.city,
                  lat: selectedHouse?.lat ?? obj.lat,
                  lng: selectedHouse?.lng ?? obj.lng,
                };
                try {
                  if (isOffline()) {
                    await queueVisit(payload);
                    toast.success("Ohne Netz gespeichert. Geht raus mit Empfang.");
                  } else {
                    await logFieldVisit({ data: payload });
                    toast.success("Nicht angetroffen");
                  }
                } catch (e) {
                  await queueVisit(payload);
                  toast.success("Auf dem Gerät gespeichert");
                }
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
              </>
            ) : (
              <Button
                className="col-span-2"
                variant="outline"
                onClick={async () => {
                  try {
                    await requestTerritoryAccess({
                      data: {
                        label: `${obj.street || ""} ${obj.city || ""}`.trim() || "Gebiet",
                        lat: obj.lat,
                        lng: obj.lng,
                      },
                    });
                    toast.success("Freigabe angefragt. Luca oder Orhan bekommen Push.");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Nicht gesendet");
                  }
                }}
              >
                Freigabe anfordern
              </Button>
            )}
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
