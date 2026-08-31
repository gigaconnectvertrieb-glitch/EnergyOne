import { useEffect, useRef } from "react";
import { CARTO_ATTR, CARTO_VOYAGER } from "@/lib/map-tiles";

export type WalkStop = {
  id: string;
  street: string;
  lat: number;
  lng: number;
  seq?: number;
};

type Props = {
  center: { lat: number; lng: number };
  corners?: { lat: number; lng: number }[];
  stops?: WalkStop[];
  draw?: boolean;
  onTap?: (p: { lat: number; lng: number }) => void;
  onStop?: (s: WalkStop) => void;
};

type LeafletMap = {
  remove: () => void;
  setView: (ll: [number, number], z: number) => void;
  fitBounds: (b: unknown, o?: unknown) => void;
  on: (ev: string, fn: (e: { latlng: { lat: number; lng: number } }) => void) => void;
  off: (ev: string) => void;
};

export function FieldMap({ center, corners = [], stops = [], draw, onTap, onStop }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<{ clear: () => void; add: (L: LeafletNS, map: unknown) => void } | null>(null);
  const tapRef = useRef(onTap);
  const stopRef = useRef(onStop);
  tapRef.current = onTap;
  stopRef.current = onStop;
  const cornersRef = useRef(corners);
  const stopsRef = useRef(stops);
  cornersRef.current = corners;
  stopsRef.current = stops;

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      await loadLeaflet();
      if (cancelled || !ref.current) return;
      const L = (window as unknown as { L: LeafletNS }).L;
      if (mapRef.current) return;
      const map = L.map(ref.current, {
        zoomControl: true,
        zoomAnimation: true,
        fadeAnimation: true,
        markerZoomAnimation: true,
        preferCanvas: true,
      }) as unknown as LeafletMap;
      map.setView([center.lat, center.lng], 16);
      mapRef.current = map;
      L.tileLayer(CARTO_VOYAGER, {
        attribution: CARTO_ATTR,
        maxZoom: 20,
      }).addTo(map as never);
      map.on("click", (e) => {
        tapRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng });
      });
      paint();
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [center.lat, center.lng]);

  function paint() {
    const L = (window as unknown as { L: LeafletNS }).L;
    const map = mapRef.current;
    if (!L || !map) return;
    layerRef.current?.clear();
    const group: Array<{ remove: () => void }> = [];
    const pts = cornersRef.current;
    if (pts.length) {
      const latlngs = pts.map((p) => [p.lat, p.lng] as [number, number]);
      if (pts.length >= 2) {
        const line = L.polyline(pts.length >= 3 ? [...latlngs, latlngs[0]!] : latlngs, {
          color: "#c9a227",
          weight: 3,
          dashArray: pts.length < 3 ? "6 8" : undefined,
        });
        line.addTo(map as never);
        group.push(line);
      }
      if (pts.length >= 3) {
        const poly = L.polygon(latlngs, {
          color: "#c9a227",
          weight: 2,
          fillColor: "#c9a227",
          fillOpacity: 0.18,
        });
        poly.addTo(map as never);
        group.push(poly);
        try {
          map.fitBounds(poly.getBounds(), { padding: [28, 28], maxZoom: 17 });
        } catch {
          /* */
        }
      }
      pts.forEach((p, i) => {
        const m = L.circleMarker([p.lat, p.lng], {
          radius: 6,
          color: "#0b0d12",
          weight: 2,
          fillColor: "#c9a227",
          fillOpacity: 1,
        });
        m.bindTooltip(String(i + 1), { permanent: true, direction: "top", className: "e1-num" });
        m.addTo(map as never);
        group.push(m);
      });
    }
    const ordered = stopsRef.current;
    if (ordered.length) {
      const line = L.polyline(
        ordered.map((s) => [s.lat, s.lng] as [number, number]),
        { color: "#c9a227", weight: 4, opacity: 0.95 },
      );
      line.addTo(map as never);
      group.push(line);
      ordered.forEach((s, i) => {
        const m = L.circleMarker([s.lat, s.lng], {
          radius: 5,
          color: "#0b0d12",
          weight: 1,
          fillColor: i === 0 ? "#d4af37" : "#f4f1e8",
          fillOpacity: 1,
        });
        m.bindTooltip(`${i + 1} ${s.street}`, { direction: "top", opacity: 0.95 });
        m.on("click", () => stopRef.current?.(s));
        m.addTo(map as never);
        group.push(m);
      });
    }
    layerRef.current = {
      clear: () => group.forEach((g) => g.remove()),
      add: () => undefined,
    };
  }

  useEffect(() => {
    mapRef.current?.setView([center.lat, center.lng], 16);
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
            ? `${corners.length}/3 Ecken — oder 4 für ein Rechteck`
            : corners.length === 3
              ? "Dreieck steht · 4. Tipp = Rechteck"
              : "Rechteck steht"}
        </p>
      ) : null}
    </div>
  );
}

type LeafletNS = {
  map: (el: HTMLElement, o: unknown) => LeafletMap;
  tileLayer: (u: string, o: unknown) => { addTo: (m: unknown) => void };
  polyline: (ll: [number, number][], o: unknown) => {
    addTo: (m: unknown) => void;
    remove: () => void;
  };
  polygon: (ll: [number, number][], o: unknown) => {
    addTo: (m: unknown) => void;
    remove: () => void;
    getBounds: () => unknown;
  };
  circleMarker: (ll: [number, number], o: unknown) => {
    addTo: (m: unknown) => void;
    remove: () => void;
    bindTooltip: (s: string, o?: unknown) => void;
    on: (ev: string, fn: () => void) => void;
  };
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
