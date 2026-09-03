import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Navigation, Search, X } from "lucide-react";
import { acceptTerritory, getFieldHome, getTerritoryWalk, logFieldVisit, openFieldObject, requestTerritoryAccess, searchFieldAddress } from "@/lib/server/field-api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { addOverlayLayers, boundsOf, createE1Map, loadMapLibre, setGeojson, type MapLibreMap } from "@/lib/map-gl";
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
  const [tapStart, setTapStart] = useState(false);
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
            void pick({ lat: e.latLng.lat(), lng: e.latLng.lng(), street: "", house: "", zip: "", city: "", display: "" });
          });
          void loadWalk();
          return;
        } catch {
          /* */
        }
      }
      await loadMapLibre();
      if (cancelled || !ref.current || mapRef.current) return;
      const map = createE1Map(ref.current, center, 12, { controls: false });
      mapRef.current = map;
      map.on("load", () => {
        map.resize();
        addOverlayLayers(map);
        void loadWalk();
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gebiet nicht geladen");
    } finally {
      setBusy(false);
    }
  }

  function paint(data: Walk) {
    const map = mapRef.current;
    if (!map?.getSource("e1-zone")) return;
    const ML = window.maplibregl;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (ML) {
      for (const h of data.houses.slice(0, 200)) {
        const el = document.createElement("span");
        el.className = "e1-hn";
        el.textContent = h.house;
        el.onclick = () => void pick({ lat: h.lat, lng: h.lng, street: h.street, house: h.house, zip: h.zip || "", city: h.city || "", display: `${h.street} ${h.house}` });
        markersRef.current.push(new ML.Marker({ element: el }).setLngLat([h.lng, h.lat]).addTo(map));
      }
    }
  }

  async function pick(h: Partial<Hit> & { lat: number; lng: number }) {
    if (!(h.street || "").trim() && !(h.house || "").trim()) return;
    try {
      const next = await openFieldObject({ data: { lat: h.lat, lng: h.lng, street: h.street, house: h.house, zip: h.zip, city: h.city } });
      setObj(next);
      setHouse(h.house || next.house || "");
      if (next.street) setPano({ lat: next.houses[0]?.lat || h.lat, lng: next.houses[0]?.lng || h.lng });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Straße nicht geladen");
    }
  }

  return (
    <div className="relative -mx-4 -mt-3 h-[calc(100dvh-7.5rem)] min-h-[28rem] overflow-hidden bg-[#1a1c16]">
      <div ref={ref} className="absolute inset-0" />
      {pano ? (
        <div className="absolute inset-0 z-[1150]">
          <iframe title="Street View" className="h-full w-full border-0" allow="accelerometer; gyroscope; geolocation" src={googleMapsKey() ? `https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(googleMapsKey())}&location=${pano.lat},${pano.lng}&heading=90&pitch=0&fov=80` : `https://maps.google.com/maps?q=&layer=c&cbll=${pano.lat},${pano.lng}&output=embed`} />
          <button type="button" className="absolute right-3 top-3 rounded-full bg-[#0b0d12] px-3 py-2 text-xs text-gold" onClick={() => setPano(null)}>Karte</button>
        </div>
      ) : null}
      <div className="absolute left-3 right-3 top-3 z-[1200] grid gap-2">
        <button type="button" disabled={busy} className="h-12 rounded-xl bg-gold text-sm font-medium text-bg" onClick={() => void loadWalk()}>{busy ? "Lädt…" : "Gebiet herunterladen"}</button>
        {pack?.walk.streets.length ? (
          <div className="max-h-28 overflow-auto rounded-xl bg-white/95 p-2 text-[#111]">
            {pack.walk.streets.map((s) => (
              <button key={s.street} type="button" className="mr-1 mt-1 rounded-full bg-black/5 px-2 py-1 text-xs" onClick={() => { const first = s.houses[0]; if (first) void pick({ lat: first.lat, lng: first.lng, street: s.street, house: first.house, zip: first.zip || "", city: first.city || "", display: `${s.street} ${first.house}` }); }}>{s.street}</button>
            ))}
          </div>
        ) : null}
      </div>
      {obj ? (
        <div className="absolute bottom-3 left-3 right-3 z-[1200] rounded-2xl bg-white p-4 text-[#111]">
          <p className="text-xs text-[#c9a227]">Street View</p>
          <h2 className="font-display text-2xl">{obj.street} {house}</h2>
          {(planner || obj.inTerritory) ? (
            <Button className="mt-3" onClick={() => nav({ to: "/app/abschluss", search: { street: obj.street, house, zip: obj.zip, city: obj.city } })}>Abschluss</Button>
          ) : (
            <Button className="mt-3" variant="outline" onClick={() => void requestTerritoryAccess({ data: { label: `${obj.street} ${obj.city}`, lat: obj.lat, lng: obj.lng } })}>Freigabe anfordern</Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
