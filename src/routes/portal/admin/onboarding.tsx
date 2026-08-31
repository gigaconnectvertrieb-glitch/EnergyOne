import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listApplications, updateApplication } from "@/lib/server/api";
import { Select } from "@/components/ui/field";
import { deDateTime } from "@/lib/utils";

export const Route = createFileRoute("/portal/admin/onboarding")({ component: Page });

const STAT = ["eingegangen", "gespraech", "schulung", "freigeschaltet", "abgelehnt"];

function Page() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listApplications>>>([]);
  function load() {
    listApplications().then(setRows).catch(() => setRows([]));
  }
  useEffect(load, []);
  return (
    <div>
      <h1 className="font-display text-4xl">Onboarding-Pipeline</h1>
      <div className="mt-4 grid gap-2">
        {rows.map((a) => (
          <div key={a.id} className="rounded-2xl bg-surface p-4 gold-hairline">
            <p className="font-medium">
              {a.first_name} {a.last_name}
            </p>
            <p className="text-sm text-muted">
              {a.position} · {a.email} · {a.phone}
            </p>
            <p className="mt-2 text-sm">{a.motivation}</p>
            <p className="text-xs text-muted">{deDateTime(a.created_at)}</p>
            <Select
              className="mt-3 max-w-xs"
              value={a.status}
              onChange={async (e) => {
                await updateApplication({ data: { id: a.id, status: e.target.value } });
                load();
              }}
            >
              {STAT.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}
