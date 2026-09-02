import { useEffect, useRef } from "react";
import {
  addOverlayLayers,
  createE1Map,
  loadMapLibre,
  setGeojson,
  type MapLibreMap,
} from "@/lib/map-gl";

export type WalkStop = {
  id: string;
  street: string;
  lat: number;
  lng: number;
  seq?: number;
  house?: string;
};

type Props = {
  center: { lat: number; lng: number };
  corners?: { lat: number; lng: number }[];
  stops?: WalkStop[];
  draw?: boolean;
  onTap?: (p: { lat: number; lng: number }) => void;
  onStop?: (s: WalkStop) => void;
};

export function FieldMap({ center, corners = [], stops = [], draw, onTap, onStop }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const tapRef = useRef(onTap);
  const stopRef = useRef(onStop);
  tapRef.current = onTap;
  stopRef.current = onStop;
  const cornersRef = useRef(corners);
  const stopsRef = useRef(stops);
  cornersRef.current = corners;
  stopsRef.current = stops;

  function paint() {
    const map = mapRef.current;
    if (!map?.getSource("e1-zone")) return;
    try {
      const pts = cornersRef.current;
      const zoneFeatures: unknown[] = [];
      if (pts.length >= 3) {
        const ring = [...pts.map((p) => [p.lng, p.lat] as [number, number]), [pts[0]!.lng, pts[0]!.lat]];
        zoneFeatures.push({
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [ring] },
          properties: {},
        });
      } else if (pts.length === 2) {
        zoneFeatures.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: pts.map((p) => [p.lng, p.lat]) },
          properties: {},
        });
      }
      setGeojson(map, "e1-zone", { type: "FeatureCollection", features: zoneFeatures });

      const ordered = stopsRef.current;
      setGeojson(map, "e1-route", {
        type: "FeatureCollection",
        features:
          ordered.length >= 2
            ? [
                {
                  type: "Feature",
                  geometry: { type: "LineString", coordinates: ordered.map((s) => [s.lng, s.lat]) },
                  properties: {},
                },
              ]
            : [],
      });
      setGeojson(map, "e1-points", {
        type: "FeatureCollection",
        features: pts.map((p, i) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [p.lng, p.lat] },
          properties: { kind: i === 0 ? "start" : "pt" },
        })),
      });
    } catch {
      /* MapLibre darf beim Zeichnen nicht abstürzen */
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      await loadMapLibre();
      if (cancelled || !ref.current || mapRef.current) return;
      const map = createE1Map(ref.current, center, 16, { draw });
      mapRef.current = map;
      map.on("load", () => {
        map.resize();
        addOverlayLayers(map);
        paint();
      });
      map.on("click", (e) => {
        if (!e?.lngLat) return;
        tapRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      });
    }
    void boot();
    return () => {
      cancelled = true;
      try {
        mapRef.current?.remove();
      } catch {
        /* */
      }
      mapRef.current = null;
    };
  }, [center.lat, center.lng]);

  useEffect(() => {
    mapRef.current?.jumpTo({ center: [center.lng, center.lat], zoom: 16 });
  }, [center.lat, center.lng]);

  useEffect(() => {
    paint();
  }, [corners, stops]);

  return (
    <div className="relative">
      <div ref={ref} className="h-[min(78dvh,40rem)] w-full overflow-hidden rounded-3xl bg-elevated" />
      {draw ? (
        <p className="pointer-events-none absolute left-4 top-4 rounded-full bg-bg/80 px-3 py-1.5 text-xs text-gold">
          {corners.length < 3
            ? `${corners.length}/3 Ecken — oder 4 für ein Rechteck. Danach „Straßen listen“.`
            : corners.length === 3
              ? "Dreieck steht · 4. Tipp = Rechteck · dann Straßen listen"
              : "Zone steht — unten Straßen listen"}
        </p>
      ) : (
        <p className="pointer-events-none absolute bottom-4 left-4 right-4 rounded-full bg-bg/80 px-3 py-1.5 text-center text-[11px] text-gold">
          Zwei Finger nach oben ziehen — Häuser stehen in 3D
        </p>
      )}
    </div>
  );
}
