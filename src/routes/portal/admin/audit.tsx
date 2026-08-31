import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listAudit } from "@/lib/server/api";
import { deDateTime } from "@/lib/utils";

export const Route = createFileRoute("/portal/admin/audit")({ component: Page });

function Page() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listAudit>>>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    listAudit()
      .then(setRows)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Kein Zugriff"));
  }, []);
  return (
    <div>
      <h1 className="font-display text-4xl">Audit-Log</h1>
      {err ? <p className="mt-4 text-danger">{err}</p> : null}
      <div className="mt-4 grid gap-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-2xl bg-surface p-4 text-sm gold-hairline">
            <p className="font-medium">
              {r.action} · {r.entity_type}
            </p>
            <p className="text-xs text-muted">
              {r.user} · {deDateTime(r.created_at)} · {r.entity_id}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
