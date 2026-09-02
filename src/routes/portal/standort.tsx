import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { listWorkLive, listWorkPings } from "@/lib/server/work-api";
import { listEmergencies } from "@/lib/server/emergency-api";
import { createE1Map, loadMapLibre, type MapLibreMap } from "@/lib/map-gl";

export const Route = createFileRoute("/portal/standort")({ component: Page });

function Page() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listWorkLive>>>([]);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [pings, setPings] = useState<Awaited<ReturnType<typeof listWorkPings>>>([]);
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const marks = useRef<Array<{ remove: () => void }>>([]);
  useEffect(() => {
    const load = () => {
      listWorkLive()
        .then(setRows)
        .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Kein Zugriff"));
      listEmergencies().then(setAlarms).catch(() => setAlarms([]));
    };
    void load();
    const t = window.setInterval(load, 15000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (!open) {
      setPings([]);
      return;
    }
    listWorkPings({ data: { shiftId: open } })
      .then(setPings)
      .catch(() => setPings([]));
  }, [open]);
  useEffect(() => {
    let cancel = false;
    async function boot() {
      await loadMapLibre();
      if (cancel || !mapEl.current || mapRef.current) return;
      const first = rows.find((r) => r.lat && r.lng);
      mapRef.current = createE1Map(mapEl.current, first ? { lat: first.lat, lng: first.lng } : { lat: 50.1, lng: 8.7 }, 8, { controls: true });
    }
    void boot();
    return () => {
      cancel = true;
    };
  }, []);
  useEffect(() => {
    const map = mapRef.current;
    const ML = window.maplibregl;
    if (!map || !ML) return;
    marks.current.forEach((m) => m.remove());
    marks.current = [];
    for (const r of rows) {
      if (!r.lat || !r.lng) continue;
      const el = document.createElement("div");
      el.className = "rounded-full bg-gold px-2 py-1 text-[10px] text-bg";
      el.textContent = r.name.split(" ")[0] || r.staff_id || "·";
      const mk = new ML.Marker({ element: el }).setLngLat([r.lng, r.lat]).addTo(map);
      marks.current.push(mk);
    }
  }, [rows]);
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.22em] text-gold">Organisation</p>
      <h1 className="mt-1 font-display text-4xl">Standort im Feld</h1>
      <p className="mt-2 text-sm text-muted">
        Kommt direkt aus der Feld-App, sobald jemand Arbeit starten drückt. Liste alle 15 Sekunden neu.
      </p>
      {err ? <p className="mt-4 text-danger">{err}</p> : null}
      <div ref={mapEl} className="mt-6 h-[22rem] overflow-hidden rounded-3xl gold-hairline" />
      {alarms.filter((a) => a.kind === "still").length ? (
        <div className="mt-6 grid gap-3">
          {alarms
            .filter((a) => a.kind === "still")
            .map((a) => (
              <div key={a.id} className="rounded-3xl border border-red-500/40 bg-surface p-5">
                <p className="text-sm font-medium text-red-300">Stiller Alarm · {a.name}</p>
                <p className="mt-2 text-sm">{a.address || "Standort siehe Koordinaten"}</p>
                {a.note ? <p className="mt-1 text-sm text-muted">{a.note}</p> : null}
                {a.lat && a.lng ? (
                  <a className="mt-2 inline-block text-xs text-gold" href={`https://www.google.com/maps?q=${a.lat},${a.lng}`} target="_blank" rel="noreferrer">
                    {a.lat.toFixed(5)} / {a.lng.toFixed(5)}
                  </a>
                ) : null}
              </div>
            ))}
        </div>
      ) : null}
      <div className="mt-6 grid gap-3">
        {rows.map((r) => (
          <div key={r.id} className="rounded-3xl bg-surface p-5 gold-hairline">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">
                {r.name} <span className="text-xs text-muted">{r.staff_id}</span>
              </p>
              <span className={r.live ? "text-xs text-gold" : "text-xs text-muted"}>{r.live ? "arbeitet jetzt" : "Feierabend"}</span>
            </div>
            <p className="mt-2 text-sm">{r.address || "Wartet auf GPS"}</p>
            {r.lat && r.lng ? (
              <p className="mt-1 font-mono text-xs text-muted">
                {r.lat.toFixed(5)} / {r.lng.toFixed(5)}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-muted">
              Start {new Date(r.started_at).toLocaleString("de-DE")}
              {r.last_at ? ` · Update ${new Date(r.last_at).toLocaleTimeString("de-DE")}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              {r.lat && r.lng ? (
                <a className="text-gold" href={`https://www.google.com/maps?q=${r.lat},${r.lng}`} target="_blank" rel="noreferrer">
                  Google Maps
                </a>
              ) : null}
              <button type="button" className="text-gold" onClick={() => setOpen(open === r.id ? null : r.id)}>
                {open === r.id ? "Spur zu" : "Spur zeigen"}
              </button>
            </div>
            {open === r.id ? (
              <ul className="mt-3 grid gap-1 text-xs text-muted">
                {pings.map((p) => (
                  <li key={p.at}>
                    {new Date(p.at).toLocaleTimeString("de-DE")} · {p.address || `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`}
                  </li>
                ))}
                {!pings.length ? <li>Noch keine weiteren Punkte.</li> : null}
              </ul>
            ) : null}
          </div>
        ))}
        {!rows.length && !err ? <p className="text-sm text-muted">Niemand hat heute Arbeit starten gedrückt.</p> : null}
      </div>
    </div>
  );
}
