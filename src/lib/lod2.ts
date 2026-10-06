export async function loadHessianBuildings(bbox: [number, number, number, number]) {
  const [west, south, east, north] = bbox;
  const url = `https://inspire-hessen.de/ows/services/org.2.ef07833e-78a6-4c2c-a895-e31de788aac3_wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=bu-core3d:Building&bbox=${west},${south},${east},${north},EPSG:4326&count=80&outputFormat=application/json`;
  const res = await fetch(url);
  if (!res.ok) return { type: "FeatureCollection", features: [] };
  const data = await res.json();
  const features = [];
  for (const feature of data.features || []) {
    const lines = feature.geometry?.type === "MultiLineString" ? feature.geometry.coordinates : [];
    const points = lines.flat();
    if (points.length < 4) continue;
    const ring = hull(points);
    if (ring.length < 4) continue;
    const values = feature.properties?.value;
    const height = Array.isArray(values) ? Math.max(3, Math.round(Math.max(...values) - Math.min(...values))) : 8;
    features.push({ type: "Feature", properties: { height }, geometry: { type: "Polygon", coordinates: [ring] } });
  }
  return { type: "FeatureCollection", features };
}

function hull(points: number[][]) {
  const uniq = points.filter((p, i) => points.findIndex((q) => q[0] === p[0] && q[1] === p[1]) === i);
  uniq.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: number[][] = [];
  for (const p of uniq) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: number[][] = [];
  for (const p of uniq.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower, ...upper.slice(1)];
}
