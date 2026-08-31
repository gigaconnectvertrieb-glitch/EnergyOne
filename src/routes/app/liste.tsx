import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { listWeeklyFollowups, setFollowupStatus } from "@/lib/server/field-api";
import { VISIT_LABELS, type VisitReason } from "@/lib/field";
import { toast } from "sonner";

export const Route = createFileRoute("/app/liste")({ component: Page });

function Page() {
  const [data, setData] = useState<Awaited<ReturnType<typeof listWeeklyFollowups>> | null>(null);
  function load() {
    listWeeklyFollowups().then(setData).catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Fehler"));
  }
  useEffect(load, []);
  return (
    <div>
      <h1 className="font-display text-3xl">Wochenliste</h1>
      <p className="mt-1 text-sm text-muted">Nicht angetroffen und Laufzeit — abarbeiten bis leer.</p>
      <ul className="mt-5 grid gap-2">
        {(data?.rows || []).map((r) => (
          <li key={r.id} className="rounded-2xl bg-surface p-4 gold-hairline">
            <p className="font-medium">
              {r.street} {r.house}
            </p>
            <p className="text-sm text-muted">
              {VISIT_LABELS[r.reason as VisitReason] || r.reason} · {r.follow_up_on || "—"}
            </p>
            {r.note ? <p className="mt-1 text-sm">{r.note}</p> : null}
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={async () => {
                await setFollowupStatus({ data: { id: r.id, status: "erledigt" } });
                toast.success("Abgehakt");
                load();
              }}
            >
              Erledigt
            </Button>
          </li>
        ))}
        {data && data.rows.length === 0 ? <li className="text-sm text-muted">Liste ist leer.</li> : null}
      </ul>
    </div>
  );
}
