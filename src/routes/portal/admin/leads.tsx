import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listLeads, updateLead } from "@/lib/server/api";
import { Select } from "@/components/ui/field";
import { deDateTime } from "@/lib/utils";

export const Route = createFileRoute("/portal/admin/leads")({ component: Page });

function Page() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listLeads>>>([]);
  function load() {
    listLeads().then(setRows).catch(() => setRows([]));
  }
  useEffect(load, []);
  return (
    <div>
      <h1 className="font-display text-4xl">Beratungsanfragen</h1>
      <div className="mt-4 grid gap-2">
        {rows.map((l) => (
          <div key={l.id} className="rounded-2xl bg-surface p-4 gold-hairline">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{l.name}</p>
                <p className="text-sm text-muted">
                  {l.phone} · PLZ {l.zip || "—"}
                </p>
                <p className="mt-1 text-sm">{l.message}</p>
                <p className="text-xs text-muted">{deDateTime(l.created_at)}</p>
              </div>
              <Select
                value={l.status}
                onChange={async (e) => {
                  await updateLead({ data: { id: l.id, status: e.target.value } });
                  load();
                }}
                className="max-w-40"
              >
                <option value="neu">Neu</option>
                <option value="kontaktiert">Kontaktiert</option>
                <option value="termin">Termin</option>
                <option value="erledigt">Erledigt</option>
              </Select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
