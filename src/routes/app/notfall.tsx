import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { closeEmergency, listEmergencies, silentAlarm, startEmergency } from "@/lib/server/emergency-api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/app/notfall")({
  validateSearch: (raw: Record<string, unknown>) => ({
    room: typeof raw.room === "string" ? raw.room : undefined,
  }),
  component: Page,
});

function Page() {
  const nav = useNavigate();
  const { room: given } = Route.useSearch();
  const [room, setRoom] = useState(given || "");
  const [id, setId] = useState("");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const [open, setOpen] = useState<Awaited<ReturnType<typeof listEmergencies>>>([]);
  const src = useMemo(
    () => (room ? `https://meet.jit.si/${encodeURIComponent(room)}#config.prejoinPageEnabled=false` : ""),
    [room],
  );

  useEffect(() => {
    listEmergencies().then(setOpen).catch(() => setOpen([]));
  }, []);

  async function start() {
    try {
      const r = await startEmergency();
      setRoom(r.room);
      setId(r.id);
      toast.success("Leitung wird gerufen.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nicht gestartet");
    }
  }

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-gold">Live</p>
        <h1 className="mt-1 font-display text-4xl">Notfall</h1>
        <p className="mt-2 text-sm text-muted">
          Video zu Luca und Orhan. Kamera und Mikrofon erlauben. Die Leitung sieht den Ruf im Portal und in der App.
        </p>
      </div>
      {!room ? (
        <>
          <Button onClick={() => void start()}>Leitung zuschalten</Button>
          <div className="rounded-2xl bg-surface p-4 gold-hairline">
            <p className="text-sm font-medium">Stiller Alarm</p>
            <p className="mt-1 text-xs text-muted">Geht an Luca und Orhan mit Standort. Die Polizei erreicht ihr nur über den Anruf.</p>
            <textarea
              className="mt-3 w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm"
              rows={2}
              placeholder="Kurz was passiert (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button
              className="mt-3 w-full"
              variant="outline"
              disabled={sent}
              onClick={async () => {
                try {
                  const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
                  });
                  await silentAlarm({
                    data: {
                      lat: pos.coords.latitude,
                      lng: pos.coords.longitude,
                      note,
                    },
                  });
                  setSent(true);
                  toast.success("Stiller Alarm bei der Leitung.");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Nicht gesendet");
                }
              }}
            >
              {sent ? "Gesendet" : "Stillen Alarm senden"}
            </Button>
            <a href="tel:110" className="mt-3 block rounded-xl bg-red-700 px-4 py-3 text-center text-sm font-medium text-white">
              110 anrufen
            </a>
          </div>
          {open.length ? (
            <div className="grid gap-2">
              <p className="text-xs text-gold">Offene Rufe</p>
              {open.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className="rounded-2xl bg-surface px-4 py-3 text-left text-sm gold-hairline"
                  onClick={() => setRoom(e.room)}
                >
                  {e.name} beitreten
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <iframe title="Notfall" className="h-[28rem] w-full rounded-2xl bg-black" allow="camera; microphone; fullscreen; display-capture" src={src} />
          <Button
            variant="outline"
            onClick={async () => {
              if (id) await closeEmergency({ data: { id } }).catch(() => {});
              setRoom("");
              nav({ to: "/app" });
            }}
          >
            Beenden
          </Button>
        </>
      )}
    </div>
  );
}
