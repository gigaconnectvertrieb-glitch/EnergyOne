import { useEffect, useRef } from "react";
import { osrmUrl } from "@/lib/field";

type Door = {
  id: string;
  street: string;
  house: string;
  zip: string;
  city: string;
  lat: number;
  lng: number;
  status: string;
  note?: string;
};

type Props = {
  center: { lat: number; lng: number };
  geojson: Record<string, unknown> | null;
  doors: Door[];
  routeTo?: { lat: number; lng: number } | null;
  onDoor: (door: Door) => void;
};

type LeafletMap = {
  remove: () => void;
  setView: (ll: [number, number], z: number) => void;
  fitBounds: (b: unknown, o?: unknown) => void;
  locate: (o: unknown) => void;
  on: (ev: string, fn: (e: { latlng: { lat: number; lng: number } }) => void) => void;
};

export function FieldMap({ center, geojson, doors, routeTo, onDoor }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const onDoorRef = useRef(onDoor);
  onDoorRef.current = onDoor;

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      await loadLeaflet();
      if (cancelled || !ref.current) return;
      const L = (window as unknown as { L: LeafletNS }).L;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      const map = L.map(ref.current, { zoomControl: true }) as unknown as LeafletMap;
      map.setView([center.lat, center.lng], 15);
      mapRef.current = map;
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Esri", maxZoom: 19 },
      ).addTo(map as never);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png", {
        attribution: "OSM",
        pane: "overlayPane",
      }).addTo(map as never);
      if (geojson && Array.isArray((geojson as { features?: unknown }).features)) {
        const layer = L.geoJSON(geojson as never, {
          style: { color: "#c9a227", weight: 2, fillOpacity: 0.12 },
          pointToLayer: () => undefined as unknown as never,
        });
        layer.addTo(map as never);
        try {
          map.fitBounds(layer.getBounds(), { padding: [24, 24] });
        } catch {
          /* empty bounds */
        }
      }
      const gold = L.divIcon({
        className: "",
        html: `<span style="display:block;width:14px;height:14px;border-radius:999px;background:#c9a227;box-shadow:0 0 0 3px rgba(201,162,39,.35)"></span>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      const muted = L.divIcon({
        className: "",
        html: `<span style="display:block;width:12px;height:12px;border-radius:999px;background:#9a9588"></span>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
      for (const door of doors) {
        const m = L.marker([door.lat, door.lng], {
          icon: door.status === "offen" ? gold : muted,
        });
        m.bindPopup(`${door.street} ${door.house}`);
        m.on("click", () => onDoorRef.current(door));
        m.addTo(map as never);
      }
      try {
        map.locate({ setView: false, maxZoom: 16 });
        map.on("locationfound", (e: { latlng: { lat: number; lng: number } }) => {
          L.circleMarker([e.latlng.lat, e.latlng.lng], {
            radius: 7,
            color: "#f4f1e8",
            fillColor: "#3b82f6",
            fillOpacity: 1,
          }).addTo(map as never);
        });
      } catch {
        /* no gps */
      }
    }
    void boot();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [center.lat, center.lng, geojson, doors]);

  useEffect(() => {
    if (!routeTo || !mapRef.current) return;
    const L = (window as unknown as { L: LeafletNS }).L;
    if (!L) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const url = osrmUrl(
          [
            { lat: pos.coords.latitude, lng: pos.coords.longitude },
            routeTo,
          ],
          "foot",
        );
        try {
          const res = await fetch(url);
          const json = (await res.json()) as { routes?: { geometry: unknown }[] };
          const geom = json.routes?.[0]?.geometry;
          if (geom && mapRef.current) {
            const layer = L.geoJSON(geom as never, { style: { color: "#c9a227", weight: 4 } });
            layer.addTo(mapRef.current as never);
          }
        } catch {
          /* offline */
        }
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, [routeTo]);

  return <div ref={ref} className="h-[min(70dvh,32rem)] w-full overflow-hidden rounded-3xl bg-elevated" />;
}

type LeafletNS = {
  map: (el: HTMLElement, o: unknown) => {
    setView: (ll: [number, number], z: number) => unknown;
    fitBounds: (b: unknown, o?: unknown) => void;
    locate: (o: unknown) => void;
    on: (ev: string, fn: (e: { latlng: { lat: number; lng: number } }) => void) => void;
    remove: () => void;
  };
  tileLayer: (u: string, o: unknown) => { addTo: (m: unknown) => void };
  geoJSON: (g: never, o: unknown) => {
    addTo: (m: unknown) => void;
    getBounds: () => unknown;
  };
  marker: (ll: [number, number], o: unknown) => {
    bindPopup: (s: string) => void;
    on: (ev: string, fn: () => void) => void;
    addTo: (m: unknown) => void;
  };
  divIcon: (o: unknown) => unknown;
  circleMarker: (ll: [number, number], o: unknown) => { addTo: (m: unknown) => void };
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
