import { SATELLITE, SATELLITE_ATTR } from "@/lib/map-tiles";

export type LngLat = { lat: number; lng: number };

export type MapLibreMap = {
  remove: () => void;
  getPitch: () => number;
  easeTo: (o: Record<string, unknown>) => void;
  setCenter: (ll: [number, number]) => void;
  setZoom: (z: number) => void;
  jumpTo: (o: { center: [number, number]; zoom?: number; pitch?: number }) => void;
  fitBounds: (b: [[number, number], [number, number]], o?: Record<string, unknown>) => void;
  on: (ev: string, fn: (e?: { lngLat: { lat: number; lng: number } }) => void) => void;
  getSource: (id: string) => { setData: (d: unknown) => void } | undefined;
  addSource: (id: string, s: unknown) => void;
  addLayer: (l: unknown) => void;
  loaded: () => boolean;
  resize: () => void;
};

declare global {
  interface Window {
    maplibregl?: {
      Map: new (o: Record<string, unknown>) => MapLibreMap;
      Marker: new (o?: Record<string, unknown>) => {
        setLngLat: (ll: [number, number]) => { addTo: (m: MapLibreMap) => { remove: () => void } };
        remove: () => void;
      };
    };
  }
}

export function satellite3dStyle() {
  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      satellite: {
        type: "raster",
        tiles: [SATELLITE],
        tileSize: 256,
        attribution: SATELLITE_ATTR,
        maxzoom: 19,
      },
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap",
        maxzoom: 19,
      },
      openmaptiles: {
        type: "vector",
        url: "https://tiles.openfreemap.org/planet",
      },
    },
    layers: [
      { id: "osm", type: "raster", source: "osm" },
      { id: "sat", type: "raster", source: "satellite", paint: { "raster-opacity": 0.92 } },
      {
        id: "3d-buildings",
        source: "openmaptiles",
        "source-layer": "building",
        type: "fill-extrusion",
        minzoom: 14,
        paint: {
          "fill-extrusion-color": [
            "case",
            ["has", "colour"],
            ["get", "colour"],
            [
              "interpolate",
              ["linear"],
              ["coalesce", ["get", "render_height"], ["get", "height"], 10],
              0,
              "#9b9b96",
              10,
              "#7d7d78",
              25,
              "#5c5c58",
              60,
              "#3a3a38",
            ],
          ],
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], ["get", "height"], 10],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 0.78,
        },
      },
      {
        id: "road-label",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "transportation_name",
        minzoom: 13,
        layout: {
          "text-field": ["coalesce", ["get", "name:de"], ["get", "name"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": 12,
          "symbol-placement": "line",
        },
        paint: {
          "text-color": "#f4f1e8",
          "text-halo-color": "#0b0d12",
          "text-halo-width": 1.2,
        },
      },
    ],
  };
}

let loadP: Promise<void> | null = null;
export function loadMapLibre() {
  if (window.maplibregl) return Promise.resolve();
  if (loadP) return loadP;
  loadP = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css";
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("3D-Karte nicht geladen"));
    document.body.appendChild(s);
  });
  return loadP;
}

export function createE1Map(
  el: HTMLElement,
  center: LngLat,
  zoom = 16,
  opts?: { controls?: boolean; draw?: boolean },
) {
  const ML = window.maplibregl;
  if (!ML) throw new Error("MapLibre fehlt");
  const draw = Boolean(opts?.draw);
  return new ML.Map({
    container: el,
    style: satellite3dStyle(),
    center: [center.lng, center.lat],
    zoom,
    pitch: 0,
    bearing: 0,
    maxPitch: draw ? 0 : 75,
    minZoom: 4,
    maxZoom: 20,
    touchPitch: !draw,
    dragRotate: !draw,
    pitchWithRotate: !draw,
    attributionControl: { compact: true },
  });
}

export function addOverlayLayers(map: MapLibreMap) {
  const empty = { type: "FeatureCollection", features: [] };
  if (!map.getSource("e1-zone")) {
    map.addSource("e1-zone", { type: "geojson", data: empty });
    map.addLayer({
      id: "e1-zone-fill",
      type: "fill",
      source: "e1-zone",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": "#c9a227", "fill-opacity": 0.16 },
    });
    map.addLayer({
      id: "e1-zone-line",
      type: "line",
      source: "e1-zone",
      filter: ["in", ["geometry-type"], "Polygon", "LineString"],
      paint: { "line-color": "#c9a227", "line-width": 3 },
    });
  }
  if (!map.getSource("e1-route")) {
    map.addSource("e1-route", { type: "geojson", data: empty });
    map.addLayer({
      id: "e1-route-line",
      type: "line",
      source: "e1-route",
      paint: { "line-color": "#f0d78c", "line-width": 3, "line-opacity": 0.95 },
    });
  }
  if (!map.getSource("e1-points")) {
    map.addSource("e1-points", { type: "geojson", data: empty });
    map.addLayer({
      id: "e1-points-circle",
      type: "circle",
      source: "e1-points",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 5,
        "circle-color": ["case", ["==", ["get", "kind"], "start"], "#d4af37", "#f4f1e8"],
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#0b0d12",
      },
    });
  }
}

export function setGeojson(
  map: MapLibreMap,
  id: string,
  data: { type: "FeatureCollection"; features: unknown[] },
) {
  map.getSource(id)?.setData(data);
}

export function boundsOf(pts: LngLat[]): [[number, number], [number, number]] | null {
  if (!pts.length) return null;
  let s = pts[0]!.lat,
    n = pts[0]!.lat,
    w = pts[0]!.lng,
    e = pts[0]!.lng;
  for (const p of pts) {
    if (p.lat < s) s = p.lat;
    if (p.lat > n) n = p.lat;
    if (p.lng < w) w = p.lng;
    if (p.lng > e) e = p.lng;
  }
  return [
    [w, s],
    [e, n],
  ];
}
