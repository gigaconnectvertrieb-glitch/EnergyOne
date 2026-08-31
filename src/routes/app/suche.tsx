import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Navigation } from "lucide-react";
import { getTerritoryWalk, logFieldVisit } from "@/lib/server/field-api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/app/suche")({ component: Page });

function Page() {
  const nav = useNavigate();
  const [pack, setPack] = useState<Awaited<ReturnType<typeof getTerritoryWalk>> | null>(null);
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

  const streets = pack?.walk.streets || [];

  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.22em] text-gold">Suche · Laufweg</p>
      <h1 className="mt-1 font-display text-3xl">{pack?.name || "Gebiet"}</h1>
      <p className="mt-1 text-sm text-muted">
        Startpunkt setzen, Route wird berechnet: Straße für Straße, Hausnummern in Gehreihenfolge.
      </p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={gps} disabled={busy}>
          <Navigation className="size-3.5" /> Start hier
        </Button>
        <p className="self-center text-xs text-muted">
          {busy ? "Berechnet…" : pack ? `${pack.walk.count} Häuser · ${(pack.walk.meters / 1000).toFixed(1)} km` : ""}
        </p>
      </div>
      <ol className="mt-4 grid gap-3">
        {streets.map((s, i) => (
          <li key={`${s.street}-${i}`} className="rounded-2xl bg-surface p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-display text-xl">
                <span className="mr-2 text-gold">{i + 1}</span>
                {s.street}
              </p>
              <p className="text-[11px] text-muted">{s.houses.length} Nr. · {Math.round(s.meters)} m</p>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-ink">
              {s.houses.map((h) => h.house).join(" · ")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
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
                    to: "/portal/auftraege/neu",
                    search: { street: s.street, house: first?.house || "", zip: "", city: pack?.name || "" },
                  });
                }}
              >
                Abschluss
              </Button>
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
