import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { requireProfile, sql } from "@/lib/server/helpers";

export const planTerritoryAgent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { place: string }) => d)
  .handler(async ({ context, data }) => {
    await requireProfile(await sql(), context.userId);
    const place = data.place.trim();
    const rows = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=de&limit=8&q=${encodeURIComponent(place)}`).then((res) => res.json()) as Array<{ display_name: string; lat: string; lon: string }>;
    const key = process.env.GEMINI_API_KEY;
    if (!key) return { ok: false as const, reason: "Gemini-Key fehlt" };
    const choices = rows.map((row, index) => `${index}. ${row.display_name}`).join("\n");
    const ai = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent", {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts: [{ text: `Waehle eine Wohnstrasse fuer Aussendienst. Antworte nur mit der Indexzahl.\n${choices}` }] }] }),
    }).then((res) => res.json()).catch(() => null);
    const answer = String(ai?.candidates?.[0]?.content?.parts?.[0]?.text || "0");
    const index = Number(answer.match(/\d+/)?.[0] || 0);
    const hit = rows[index] || rows[0];
    if (!hit) return { ok: false as const, reason: "Kein Treffer" };
    return { ok: true as const, display_name: hit.display_name, lat: hit.lat, lon: hit.lon, reason: answer };
  });

export const readStreetHouses = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { street: string; lat: number; lng: number }) => d)
  .handler(async ({ context, data }) => {
    await requireProfile(await sql(), context.userId);
    const street = data.street.replace(/"/g, "");
    const south = data.lat - 0.02, north = data.lat + 0.02, west = data.lng - 0.03, east = data.lng + 0.03;
    const query = `[out:json][timeout:25];(node["addr:street"="${street}"]["addr:housenumber"](${south},${west},${north},${east});way["addr:street"="${street}"]["addr:housenumber"](${south},${west},${north},${east}););out center;`;
    const res = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: `data=${encodeURIComponent(query)}` });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.elements || []).map((el) => ({ street: el.tags?.["addr:street"] || street, house: el.tags?.["addr:housenumber"] || "", lat: el.lat || el.center?.lat, lng: el.lon || el.center?.lon })).filter((d) => d.lat && d.house);
  });
