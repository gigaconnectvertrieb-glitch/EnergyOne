declare global {
  interface Window {
    google?: {
      maps: {
        Map: new (el: HTMLElement, o: Record<string, unknown>) => GoogleMap;
        Marker: new (o: Record<string, unknown>) => { setMap: (m: GoogleMap | null) => void; addListener: (e: string, fn: () => void) => void };
        event: { addListener: (m: GoogleMap, e: string, fn: (ev: { latLng: { lat: () => number; lng: () => number } }) => void) => void };
      };
    };
  }
}

export type GoogleMap = {
  setCenter: (o: { lat: number; lng: number }) => void;
  setZoom: (z: number) => void;
  setTilt: (n: number) => void;
  setHeading: (n: number) => void;
};

export function googleMapsKey() {
  return String((import.meta as { env?: { VITE_GOOGLE_MAPS_KEY?: string } }).env?.VITE_GOOGLE_MAPS_KEY || "AIzaSyBIlujIrecGRQUpllxMNgcpnaXNyvD4TDU").trim();
}

export function loadGoogleMaps(key: string) {
  return new Promise<void>((resolve, reject) => {
    if (window.google?.maps) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Google Maps nicht geladen"));
    document.head.appendChild(s);
  });
}

export function createGoogleMap(el: HTMLElement, center: { lat: number; lng: number }) {
  const g = window.google;
  if (!g?.maps) throw new Error("Google Maps fehlt");
  return new g.maps.Map(el, {
    center,
    zoom: 18,
    mapTypeId: "hybrid",
    tilt: 67.5,
    heading: 20,
    gestureHandling: "greedy",
    streetViewControl: false,
    mapTypeControl: true,
    fullscreenControl: false,
  }) as GoogleMap;
}
