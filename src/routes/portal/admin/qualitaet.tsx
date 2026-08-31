import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listAlerts, listUsers, resolveAlert, updateUser } from "@/lib/server/api";
import { Button } from "@/components/ui/button";
import { deDateTime } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/admin/qualitaet")({ component: Page });

function Page() {
  const [alerts, setAlerts] = useState<Awaited<ReturnType<typeof listAlerts>>>([]);
  const [users, setUsers] = useState<Awaited<ReturnType<typeof listUsers>>>([]);
  function load() {
    listAlerts().then(setAlerts).catch(() => setAlerts([]));
    listUsers().then(setUsers).catch(() => setUsers([]));
  }
  useEffect(load, []);
  return (
    <div>
      <h1 className="font-display text-4xl">Qualität & Compliance</h1>
      <h2 className="mt-6 text-sm uppercase tracking-[0.16em] text-gold">Offene Warnungen</h2>
      <div className="mt-2 grid gap-2">
        {alerts.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded-2xl bg-surface p-4 gold-hairline">
            <div>
              <p className="font-medium">
                {a.user} · {a.kind}
              </p>
              <p className="text-sm text-muted">{a.message}</p>
              <p className="text-xs text-muted">{deDateTime(a.created_at)}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await resolveAlert({ data: a.id });
                load();
              }}
            >
              Erledigt
            </Button>
          </div>
        ))}
        {alerts.length === 0 ? <p className="text-sm text-muted">Keine offenen Warnungen.</p> : null}
      </div>
      <h2 className="mt-8 text-sm uppercase tracking-[0.16em] text-gold">Stornoquote</h2>
      <div className="mt-2 grid gap-2">
        {users
          .filter((u) => u.orders > 0)
          .map((u) => {
            const q = Math.round((u.stornos / u.orders) * 100);
            return (
              <div key={u.user_id} className="flex items-center justify-between rounded-2xl bg-surface p-4 gold-hairline">
                <div>
                  <p className="font-medium">
                    {u.first_name} {u.last_name}
                  </p>
                  <p className="text-xs text-muted">
                    {u.stornos}/{u.orders} Storno · {q}%
                  </p>
                </div>
                {q >= 20 ? (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      await updateUser({ data: { userId: u.user_id, status: "blocked" } });
                      toast.success("Zugang gesperrt");
                      load();
                    }}
                  >
                    Sperren
                  </Button>
                ) : null}
              </div>
            );
          })}
      </div>
    </div>
  );
}
