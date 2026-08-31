import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getAppToday } from "@/lib/server/plan-api";
import { logFieldVisit } from "@/lib/server/field-api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/app/")({ component: Page });

function Page() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getAppToday>> | null>(null);
  useEffect(() => {
    getAppToday().then(setData).catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Fehler"));
  }, []);
  if (!data) return <div className="h-40 animate-pulse rounded-3xl bg-surface" />;
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.2em] text-gold">Heute</p>
      <h1 className="mt-1 font-display text-4xl">{data.name}.</h1>
      <p className="mt-2 text-sm text-muted">
        {data.day
          ? `${data.city} · Tag ${data.day} · ${data.stops.length} Straßen · ${(data.meters / 1000).toFixed(1)} km`
          : "Noch kein Tagesplan. Leitung spielt das Gebiet in der Planung auf."}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link to="/app/karte" className="rounded-2xl bg-gold px-4 py-3 text-center text-sm font-medium text-bg">
          Karte
        </Link>
        <Link to="/app/liste" className="rounded-2xl px-4 py-3 text-center text-sm gold-hairline">
          Nachlauf {data.openFollowups ? `(${data.openFollowups})` : ""}
        </Link>
      </div>
      <ol className="mt-6 grid gap-2">
        {data.stops.map((s) => (
          <li key={s.id} className="rounded-2xl bg-surface p-4 gold-hairline">
            <p className="text-xs text-gold">{s.seq}.</p>
            <p className="font-medium">{s.street}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={async () => {
                await logFieldVisit({
                  data: {
                    doorId: s.id,
                    reason: "nicht_angetroffen",
                    street: s.street,
                    lat: s.lat,
                    lng: s.lng,
                  },
                });
                toast.success("Nicht angetroffen — in der Wochenliste");
              }}
            >
              Nicht angetroffen
            </Button>
          </li>
        ))}
      </ol>
    </div>
  );
}
