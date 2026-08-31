import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listWeeklyFollowups, setFollowupStatus } from "@/lib/server/field-api";
import { VISIT_LABELS, type VisitReason } from "@/lib/field";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/liste")({ component: Page });

function Page() {
  const [data, setData] = useState<Awaited<ReturnType<typeof listWeeklyFollowups>> | null>(null);
  function load() {
    listWeeklyFollowups().then(setData).catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Fehler"));
  }
  useEffect(load, []);
  const rows = data?.rows || [];
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.22em] text-gold">Nachlauf</p>
      <h1 className="mt-1 font-display text-3xl">Noch offen</h1>
      <p className="mt-1 text-sm text-muted">Nicht angetroffen und Laufzeit — bis die Liste leer ist.</p>
      <ul className="mt-4 divide-y divide-white/6 overflow-hidden rounded-2xl bg-surface">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px]">{r.street} {r.house}</p>
              <p className="text-xs text-muted">
                {VISIT_LABELS[r.reason as VisitReason] || r.reason}
                {r.follow_up_on ? ` · ${r.follow_up_on}` : ""}
              </p>
            </div>
            <button
              type="button"
              className={cn("min-h-10 shrink-0 rounded-full px-3 text-xs uppercase tracking-[0.12em] gold-hairline")}
              onClick={async () => {
                await setFollowupStatus({ data: { id: r.id, status: "erledigt" } });
                toast.success("Erledigt");
                load();
              }}
            >
              Fertig
            </button>
          </li>
        ))}
        {data && rows.length === 0 ? <li className="px-4 py-8 text-center text-sm text-muted">Nichts offen.</li> : null}
      </ul>
    </div>
  );
}
