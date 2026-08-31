import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { listWeeklyFollowups, setFollowupStatus } from "@/lib/server/field-api";
import { VISIT_LABELS, type VisitReason } from "@/lib/field";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/feld/woche")({ component: Page });

function Page() {
  const [data, setData] = useState<Awaited<ReturnType<typeof listWeeklyFollowups>> | null>(null);
  function load() {
    listWeeklyFollowups().then(setData).catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Fehler"));
  }
  useEffect(load, []);
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.2em] text-gold">Nachlauf</p>
      <h1 className="mt-1 font-display text-4xl">Wochenliste {data?.week || ""}</h1>
      <p className="mt-2 text-sm text-muted">
        Nicht angetroffen, Laufzeit, kein Zutritt, später. Einmal die Woche abarbeiten, bis die Liste leer ist.
      </p>
      <Link to="/portal/feld" className="mt-4 inline-block text-sm text-gold">
        Zurück zur Karte
      </Link>
      <ul className="mt-6 grid gap-2">
        {(data?.rows || []).map((r) => (
          <li key={r.id} className="rounded-2xl bg-surface p-4 gold-hairline">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">
                  {r.street} {r.house}
                </p>
                <p className="text-sm text-muted">
                  {r.zip} {r.city} · {VISIT_LABELS[r.reason as VisitReason] || r.reason}
                </p>
                {r.note ? <p className="mt-1 text-sm">{r.note}</p> : null}
                <p className="mt-1 text-xs text-muted">
                  Wiedervorlage {r.follow_up_on || "—"} · {r.advisor}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await setFollowupStatus({ data: { id: r.id, status: "erledigt" } });
                  toast.success("Abgehakt");
                  load();
                }}
              >
                Erledigt
              </Button>
            </div>
          </li>
        ))}
        {data && data.rows.length === 0 ? (
          <li className="text-sm text-muted">Diese Woche ist die Liste leer.</li>
        ) : null}
      </ul>
    </div>
  );
}
