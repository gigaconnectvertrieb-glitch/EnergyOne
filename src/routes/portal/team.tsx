import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listUsers } from "@/lib/server/api";
import { ROLE_LABELS } from "@/lib/e1";

export const Route = createFileRoute("/portal/team")({ component: Page });

function Page() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listUsers>>>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    listUsers()
      .then(setRows)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Kein Zugriff"));
  }, []);
  return (
    <div>
      <h1 className="font-display text-4xl">Team</h1>
      {err ? <p className="mt-4 text-danger">{err}</p> : null}
      <div className="mt-4 grid gap-2">
        {rows.map((u) => (
          <div key={u.user_id} className="flex items-center justify-between rounded-2xl bg-surface p-4 gold-hairline">
            <div>
              <p className="font-medium">
                {u.first_name} {u.last_name} {u.is_demo ? <span className="text-xs text-muted">(Demo)</span> : null}
              </p>
              <p className="text-xs text-muted">
                {ROLE_LABELS[u.role]} · {u.region_name || "ohne Region"} · {u.status}
              </p>
            </div>
            <p className="text-xs tabular-nums text-muted">
              {u.orders} Aufträge · {u.stornos} Storno
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
