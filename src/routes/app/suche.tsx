import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Navigation, RotateCcw } from "lucide-react";
import { applyWalkOrder } from "@/lib/geo-de";
import { getTerritoryWalk, logFieldVisit, saveWalkOrder } from "@/lib/server/field-api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/app/suche")({ component: Page });

type Pack = Awaited<ReturnType<typeof getTerritoryWalk>>;

function Page() {
  const nav = useNavigate();
  const [pack, setPack] = useState<Pack | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(lat?: number, lng?: number) {
    setBusy(true);
    try {
      setPack(await getTerritoryWalk({ data: { lat, lng } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Keine Route");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function gps() {
    navigator.geolocation.getCurrentPosition(
      (pos) => void load(pos.coords.latitude, pos.coords.longitude),
      () => toast.error("Standort erlauben oder auf Routing den Start antippen."),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  async function persist(next: Pack["walk"]["streets"]) {
    const order = next.map((s) => ({ street: s.street, houses: s.houses.map((h) => h.house) }));
    setPack((p) => (p ? { ...p, walk: applyWalkOrder(p.walk, order), custom: true } : p));
    try {
      await saveWalkOrder({ data: { streets: order } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nicht gespeichert");
    }
  }

  const streets = pack?.walk.streets || [];

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= streets.length) return;
    const next = [...streets];
    const [row] = next.splice(i, 1);
    next.splice(j, 0, row!);
    void persist(next);
  }

  function reverse(i: number) {
    const next = streets.map((s, idx) => (idx === i ? { ...s, houses: [...s.houses].reverse() } : s));
    void persist(next);
  }

  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.22em] text-gold">Suche · Laufweg</p>
      <h1 className="mt-1 font-display text-3xl">{pack?.name || "Gebiet"}</h1>
      <p className="mt-1 text-sm text-muted">
        Straßen selbst sortieren. Pfeile = Reihenfolge, umdrehen = andere Straßenseite. Wird für dich gespeichert.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={gps} disabled={busy}>
          <Navigation className="size-3.5" /> Start hier
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !pack?.custom}
          onClick={async () => {
            await saveWalkOrder({ data: { streets: [], reset: true } });
            toast.success("Automatische Route");
            void load();
          }}
        >
          <RotateCcw className="size-3.5" /> Auto
        </Button>
        <p className="self-center text-xs text-muted">
          {busy ? "Berechnet…" : pack ? `${pack.walk.count} Häuser · ${(pack.walk.meters / 1000).toFixed(1)} km` : ""}
          {pack?.custom ? " · eigene Planung" : ""}
        </p>
      </div>
      <ol className="mt-4 grid gap-3">
        {streets.map((s, i) => (
          <li key={`${s.street}-${i}`} className="rounded-2xl bg-surface p-4">
            <div className="flex items-start gap-2">
              <div className="grid gap-1">
                <button
                  type="button"
                  className="grid size-9 place-items-center rounded-lg gold-hairline text-gold disabled:opacity-30"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label="Nach oben"
                >
                  <ArrowUp className="size-4" />
                </button>
                <button
                  type="button"
                  className="grid size-9 place-items-center rounded-lg gold-hairline text-gold disabled:opacity-30"
                  disabled={i === streets.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label="Nach unten"
                >
                  <ArrowDown className="size-4" />
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-display text-xl">
                    <span className="mr-2 text-gold">{i + 1}</span>
                    {s.street}
                  </p>
                  <p className="text-[11px] text-muted">
                    {s.houses.length} Nr. · {Math.round(s.meters)} m
                  </p>
                </div>
                <p className="mt-2 flex flex-wrap gap-1">
                  {s.houses.map((h) => (
                    <span key={`${h.lat}-${h.house}`} className="rounded bg-gold/15 px-1.5 py-0.5 text-xs tabular-nums text-gold">
                      {h.house}
                    </span>
                  ))}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => reverse(i)}>
                    Umdrehen
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const first = s.houses[0];
                      if (!first) return;
                      await logFieldVisit({
                        data: {
                          reason: "nicht_angetroffen",
                          street: s.street,
                          house: first.house,
                          lat: first.lat,
                          lng: first.lng,
                        },
                      });
                      toast.success(`${s.street} · nicht angetroffen`);
                    }}
                  >
                    Straße später
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      const first = s.houses[0];
                      nav({
                        to: "/app/abschluss",
                        search: { street: s.street, house: first?.house || "", zip: "", city: pack?.name || "" },
                      });
                    }}
                  >
                    Abschluss
                  </Button>
                </div>
              </div>
            </div>
          </li>
        ))}
        {!streets.length && !busy ? (
          <li className="text-sm text-muted">Kein Gebiet. In der Planung 3 oder 4 Ecken setzen und zuweisen.</li>
        ) : null}
      </ol>
    </div>
  );
}
