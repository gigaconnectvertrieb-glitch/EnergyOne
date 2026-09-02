import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listWorkLive, listWorkPings } from "@/lib/server/work-api";

export const Route = createFileRoute("/portal/standort")({ component: Page });

function Page() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listWorkLive>>>([]);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [pings, setPings] = useState<Awaited<ReturnType<typeof listWorkPings>>>([]);
  useEffect(() => {
    const load = () =>
      listWorkLive()
        .then(setRows)
        .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Kein Zugriff"));
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
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.22em] text-gold">Organisation</p>
      <h1 className="mt-1 font-display text-4xl">Standort im Feld</h1>
      <p className="mt-2 text-sm text-muted">
        Kommt direkt aus der Feld-App, sobald jemand Arbeit starten drückt. Liste alle 15 Sekunden neu.
      </p>
      {err ? <p className="mt-4 text-danger">{err}</p> : null}
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
