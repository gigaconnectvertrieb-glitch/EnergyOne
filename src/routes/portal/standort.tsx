import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listWorkLive } from "@/lib/server/work-api";

export const Route = createFileRoute("/portal/standort")({ component: Page });

function Page() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listWorkLive>>>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const load = () =>
      listWorkLive()
        .then(setRows)
        .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Kein Zugriff"));
    void load();
    const t = window.setInterval(load, 20000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.22em] text-gold">Feld</p>
      <h1 className="mt-1 font-display text-4xl">Standort</h1>
      <p className="mt-2 text-sm text-muted">Wer Arbeit starten gedrückt hat. Aktualisiert, solange die Feld-App offen ist.</p>
      {err ? <p className="mt-4 text-danger">{err}</p> : null}
      <div className="mt-6 grid gap-3">
        {rows.map((r) => (
          <div key={r.id} className="rounded-3xl bg-surface p-5 gold-hairline">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">
                {r.name} <span className="text-xs text-muted">{r.staff_id}</span>
              </p>
              <span className={r.live ? "text-xs text-gold" : "text-xs text-muted"}>{r.live ? "im Feld" : "Feierabend"}</span>
            </div>
            <p className="mt-2 text-sm">{r.address || "Adresse folgt mit GPS"}</p>
            <p className="mt-1 text-xs text-muted">
              Start {new Date(r.started_at).toLocaleTimeString("de-DE")}
              {r.last_at ? ` · zuletzt ${new Date(r.last_at).toLocaleTimeString("de-DE")}` : ""}
            </p>
            {r.lat && r.lng ? (
              <a
                className="mt-2 inline-block text-xs text-gold"
                href={`https://www.google.com/maps?q=${r.lat},${r.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                Karte öffnen
              </a>
            ) : null}
          </div>
        ))}
        {!rows.length && !err ? <p className="text-sm text-muted">Heute noch niemand gestartet.</p> : null}
      </div>
    </div>
  );
}
