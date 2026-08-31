import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FieldMap } from "@/components/field-map";
import { getAppToday } from "@/lib/server/plan-api";
import { logFieldVisit } from "@/lib/server/field-api";
import { VISIT_LABELS, type VisitReason } from "@/lib/field";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/app/karte")({ component: Page });

const ACTIONS: VisitReason[] = ["nicht_angetroffen", "laufzeit_passt_nicht", "kein_zutritt", "abschluss"];

function Page() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getAppToday>> | null>(null);
  const [open, setOpen] = useState<(typeof data extends infer T ? T extends { stops: infer S } ? S extends Array<infer U> ? U : never : never : never) | null>(null);

  useEffect(() => {
    getAppToday()
      .then(setData)
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Fehler"));
  }, []);

  const stops = data?.stops || [];
  const center = stops[0] ? { lat: stops[0].lat, lng: stops[0].lng } : { lat: 51.16, lng: 10.45 };

  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.22em] text-gold">Laufweg</p>
      <h1 className="mt-1 font-display text-3xl">{data?.city || "Karte"}</h1>
      <p className="mt-1 text-sm text-muted">
        Eine Linie, eine Straße nach der anderen. Tippen zum Ergebnis.
      </p>
      <div className="-mx-4 mt-3">
        {data ? (
          <FieldMap
            center={center}
            stops={stops}
            onStop={(s) => setOpen(stops.find((x) => x.id === s.id) || null)}
          />
        ) : (
          <div className="h-64 animate-pulse bg-surface" />
        )}
      </div>
      {open ? (
        <div className="mt-4 rounded-2xl bg-surface p-4">
          <p className="text-[10px] uppercase tracking-[0.16em] text-gold">Straße {open.seq}</p>
          <p className="font-display text-xl">{open.street}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {ACTIONS.map((r) => (
              <Button
                key={r}
                size="sm"
                variant={r === "nicht_angetroffen" ? "default" : "outline"}
                onClick={async () => {
                  await logFieldVisit({
                    data: { doorId: open.id, reason: r, street: open.street, lat: open.lat, lng: open.lng },
                  });
                  toast.success(VISIT_LABELS[r]);
                  setOpen(null);
                }}
              >
                {VISIT_LABELS[r]}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
