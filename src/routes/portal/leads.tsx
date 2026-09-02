import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listAllFollowups, setFollowupStatus } from "@/lib/server/field-api";
import { VISIT_LABELS, type VisitReason } from "@/lib/field";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/portal/leads")({ component: Page });

function Page() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listAllFollowups>>>([]);
  function load() {
    listAllFollowups().then(setRows).catch(() => setRows([]));
  }
  useEffect(load, []);
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.22em] text-gold">Feld</p>
      <h1 className="mt-1 font-display text-4xl">Lead-Liste</h1>
      <p className="mt-2 text-sm text-muted">Nicht angetroffen und Nachlauf aus der Feld-App. Steht in der Datenbank.</p>
      <div className="mt-6 grid gap-2">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 gold-hairline">
            <div>
              <p className="text-sm">
                {r.street} {r.house} {r.zip} {r.city}
              </p>
              <p className="text-xs text-muted">
                {VISIT_LABELS[r.reason as VisitReason] || r.reason} · {r.advisor}
                {r.follow_up_on ? ` · ${r.follow_up_on.slice(0, 10)}` : ""}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={async () => {
                await setFollowupStatus({ data: { id: r.id, status: "erledigt" } });
                load();
              }}
            >
              Erledigt
            </Button>
          </div>
        ))}
        {!rows.length ? <p className="text-sm text-muted">Keine offenen Leads.</p> : null}
      </div>
    </div>
  );
}
