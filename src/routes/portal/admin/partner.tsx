import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listPartners } from "@/lib/server/api";
import { ROLE_LABELS } from "@/lib/e1";
import { eur, deDate } from "@/lib/utils";

export const Route = createFileRoute("/portal/admin/partner")({ component: Page });

function Page() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listPartners>>>([]);
  useEffect(() => {
    listPartners().then(setRows).catch(() => setRows([]));
  }, []);
  return (
    <div>
      <h1 className="font-display text-4xl">Partner & Handelsvertreter</h1>
      <p className="text-sm text-muted">Freie Handelsvertreter nach § 84 HGB, White-Label vorbereitet.</p>
      <div className="mt-4 grid gap-2">
        {rows.map((p) => (
          <div key={p.user_id} className="rounded-2xl bg-surface p-4 gold-hairline">
            <p className="font-medium">
              {p.first_name} {p.last_name}
            </p>
            <p className="text-sm text-muted">
              {ROLE_LABELS[p.role]} · {p.user_type} · {p.contract_status || "ohne Vertrag"}
            </p>
            <p className="text-xs text-muted">
              Abschluss {eur(p.commission_abschluss)} · Struktur {eur(p.commission_struktur)} · seit{" "}
              {deDate(p.start_date)}
            </p>
          </div>
        ))}
        {rows.length === 0 ? <p className="text-sm text-muted">Noch keine Partner.</p> : null}
      </div>
    </div>
  );
}
