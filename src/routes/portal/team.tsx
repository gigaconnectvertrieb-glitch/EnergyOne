import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { bootstrapMe, listUsers, updateUser } from "@/lib/server/api";
import { getTeamGoals } from "@/lib/server/goal-api";
import { ROLE_LABELS, can } from "@/lib/e1";
import { eur } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/team")({ component: Page });

function Page() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listUsers>>>([]);
  const [goals, setGoals] = useState<Awaited<ReturnType<typeof getTeamGoals>>>([]);
  const [canKick, setCanKick] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    listUsers()
      .then(setRows)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Kein Zugriff"));
    getTeamGoals().then(setGoals).catch(() => setGoals([]));
    bootstrapMe()
      .then((m) => setCanKick(can(m.profile.role, "users.manage")))
      .catch(() => setCanKick(false));
  }, []);
  return (
    <div>
      <h1 className="font-display text-4xl">Team</h1>
      {err ? <p className="mt-4 text-danger">{err}</p> : null}
      {goals.some((g) => g.target > 0) ? (
        <div className="mt-6 rounded-3xl bg-surface p-5 gold-hairline">
          <h2 className="text-sm font-medium">Ziele</h2>
          <div className="mt-3 grid gap-3">
            {goals.map((g) => (
              <div key={g.user_id}>
                <div className="flex items-center justify-between text-sm">
                  <span>
                    {g.name}
                    <span className="ml-2 text-xs text-muted">
                      {g.period === "total" ? "Gesamt" : g.period === "year" ? "Jahr" : g.period === "week" ? "Woche" : "Monat"}
                    </span>
                  </span>
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
          <div key={u.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface p-4 gold-hairline">
            <div>
              <p className="font-medium">
                {u.first_name} {u.last_name} {u.is_demo ? <span className="text-xs text-muted">(Demo)</span> : null}
              </p>
              <p className="text-xs text-muted">
                {ROLE_LABELS[u.role]} · {u.region_name || "ohne Region"} ·{" "}
                {u.status === "active" ? "aktiv" : u.status === "inactive" ? "raus" : u.status === "blocked" ? "gesperrt" : u.status}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-xs tabular-nums text-muted">
                {u.orders} Aufträge · {u.stornos} Storno
              </p>
              {canKick && u.role !== "super_admin" && (u.status === "active" || u.status === "pending") ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-danger"
                  onClick={async () => {
                    if (
                      !window.confirm(
                        `${u.first_name} ${u.last_name} aus dem Team entfernen? Login und Gebiet weg. Aufträge bleiben.`,
                      )
                    ) {
                      return;
                    }
                    try {
                      await updateUser({ data: { userId: u.user_id, status: "inactive" } });
                      toast.success("Aus dem Team entfernt");
                      listUsers().then(setRows);
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Keine Berechtigung");
                    }
                  }}
                >
                  Entfernen
                </Button>
              ) : null}
              {canKick && u.role !== "super_admin" && (u.status === "inactive" || u.status === "blocked") ? (
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      await updateUser({ data: { userId: u.user_id, status: "active" } });
                      toast.success("Wieder im Team");
                      listUsers().then(setRows);
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Keine Berechtigung");
                    }
                  }}
                >
                  Wieder aufnehmen
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
