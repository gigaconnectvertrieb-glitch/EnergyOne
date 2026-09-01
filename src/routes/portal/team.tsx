import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listUsers } from "@/lib/server/api";
import { getTeamGoals } from "@/lib/server/goal-api";
import { ROLE_LABELS } from "@/lib/e1";
import { eur } from "@/lib/utils";

export const Route = createFileRoute("/portal/team")({ component: Page });

function Page() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listUsers>>>([]);
  const [goals, setGoals] = useState<Awaited<ReturnType<typeof getTeamGoals>>>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    listUsers()
      .then(setRows)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Kein Zugriff"));
    getTeamGoals().then(setGoals).catch(() => setGoals([]));
  }, []);
  return (
    <div>
      <h1 className="font-display text-4xl">Team</h1>
      {err ? <p className="mt-4 text-danger">{err}</p> : null}
      {goals.some((g) => g.target > 0) ? (
        <div className="mt-6 rounded-3xl bg-surface p-5 gold-hairline">
          <h2 className="text-sm font-medium">Ziele diesen Monat</h2>
          <div className="mt-3 grid gap-3">
            {goals.map((g) => (
              <div key={g.user_id}>
                <div className="flex items-center justify-between text-sm">
                  <span>{g.name}</span>
                  <span className="tabular-nums text-muted">
                    {g.target > 0 ? `${eur(g.earned)} / ${eur(g.target)}` : "kein Ziel"}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-elevated">
                  <div
                    className="h-full rounded-full bg-gold"
                    style={{ width: `${g.target > 0 ? Math.min(100, g.pct) : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
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
