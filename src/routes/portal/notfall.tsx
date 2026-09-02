import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { closeEmergency, listEmergencies } from "@/lib/server/emergency-api";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/portal/notfall")({
  validateSearch: (raw: Record<string, unknown>) => ({
    room: typeof raw.room === "string" ? raw.room : undefined,
  }),
  component: Page,
});

function Page() {
  const { room: given } = Route.useSearch();
  const [room, setRoom] = useState(given || "");
  const [open, setOpen] = useState<Awaited<ReturnType<typeof listEmergencies>>>([]);
  const src = useMemo(
    () =>
      room
        ? `https://meet.jit.si/${encodeURIComponent(room)}#config.prejoinPageEnabled=false&config.disableDeepLinking=true&interfaceConfig.MOBILE_APP_PROMO=false`
        : "",
    [room],
  );
  function load() {
    listEmergencies().then(setOpen).catch(() => setOpen([]));
  }
  useEffect(() => {
    load();
    const t = window.setInterval(load, 8000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (given) setRoom(given);
  }, [given]);
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.22em] text-gold">Live</p>
      <h1 className="mt-1 font-display text-4xl">Notfall</h1>
      <p className="mt-2 text-sm text-muted">Wenn jemand in E1 Tour zuschalten drückt, erscheint der Ruf hier.</p>
      <div className="mt-6 grid gap-2">
        {open.filter((e) => e.kind !== "still").map((e) => (
          <button
            key={e.id}
            type="button"
            className="rounded-2xl bg-surface px-4 py-3 text-left gold-hairline"
            onClick={() => setRoom(e.room)}
          >
            {e.name} · {new Date(e.created_at).toLocaleTimeString("de-DE")}
          </button>
        ))}
        {!open.filter((e) => e.kind !== "still").length ? <p className="text-sm text-muted">Kein offener Video-Ruf.</p> : null}
      </div>
      {src ? (
        <div className="mt-6">
          <iframe title="Notfall" className="h-[32rem] w-full rounded-2xl bg-black" allow="camera; microphone; fullscreen; display-capture" src={src} />
          <Button
            className="mt-3"
            variant="outline"
            onClick={async () => {
              const hit = open.find((e) => e.room === room);
              if (hit) await closeEmergency({ data: { id: hit.id } }).catch(() => {});
              setRoom("");
              load();
            }}
          >
            Beenden
          </Button>
        </div>
      ) : null}
    </div>
  );
}
