import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listRegions, listUsers, updateUser } from "@/lib/server/api";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/e1";
import { MAIL_DOMAIN, workspaceLocalPart } from "@/lib/mail";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/admin/benutzer")({ component: Page });

function Page() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listUsers>>>([]);
  const [regions, setRegions] = useState<Awaited<ReturnType<typeof listRegions>>>([]);
  function load() {
    listUsers().then(setRows);
    listRegions().then(setRegions);
  }
  useEffect(load, []);
  return (
    <div>
      <h1 className="font-display text-4xl">Benutzer & Rechte</h1>
      <p className="text-sm text-muted">Erste Anmeldung wird Super-Admin. Weitere warten auf Freigabe.</p>
      <div className="mt-4 grid gap-3">
        {rows.map((u) => (
          <div key={u.user_id} className="rounded-2xl bg-surface p-4 gold-hairline">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">
                  {u.first_name} {u.last_name}
                </p>
                <p className="text-xs text-muted">
                  {u.email || u.user_id} · {workspaceLocalPart(u.first_name, u.last_name)}@{MAIL_DOMAIN} · {u.orders} Aufträge
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select
                  value={u.role}
                  onChange={async (e) => {
                    await updateUser({ data: { userId: u.user_id, role: e.target.value as Role } });
                    toast.success("Rolle gesetzt");
                    load();
                  }}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
                <Select
                  value={u.region_id || ""}
                  onChange={async (e) => {
                    await updateUser({ data: { userId: u.user_id, regionId: e.target.value || null } });
                    load();
                  }}
                >
                  <option value="">Region</option>
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
                <Select
                  value={String(u.commission_stufe || 1)}
                  onChange={async (e) => {
                    await updateUser({ data: { userId: u.user_id, commissionStufe: Number(e.target.value) } });
                    toast.success("Stufe gesetzt");
                    load();
                  }}
                >
                  <option value="1">Stufe 1</option>
                  <option value="2">Stufe 2</option>
                  <option value="3">Stufe 3</option>
                </Select>
                <Select
                  value={u.status}
                  onChange={async (e) => {
                    await updateUser({ data: { userId: u.user_id, status: e.target.value } });
                    toast.success("Status gesetzt");
                    load();
                  }}
                >
                  <option value="pending">Ausstehend</option>
                  <option value="active">Aktiv</option>
                  <option value="inactive">Inaktiv</option>
                  <option value="blocked">Gesperrt</option>
                </Select>
              </div>
            </div>
            {u.status === "pending" ? (
              <Button
                className="mt-3"
                size="sm"
                onClick={async () => {
                  await updateUser({ data: { userId: u.user_id, status: "active" } });
                  load();
                }}
              >
                Freischalten
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
