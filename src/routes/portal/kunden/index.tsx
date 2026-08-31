import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listCustomers } from "@/lib/server/api";
import { Input } from "@/components/ui/field";

export const Route = createFileRoute("/portal/kunden/")({ component: Page });

function Page() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listCustomers>>>([]);
  useEffect(() => {
    const t = setTimeout(() => {
      listCustomers({ data: q }).then(setRows).catch(() => setRows([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div>
      <h1 className="font-display text-4xl">Kunden</h1>
      <Input className="mt-4 max-w-md" placeholder="Name, PLZ, Ort, Telefon" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mt-4 grid gap-2">
        {rows.map((c) => (
          <Link
            key={c.id}
            to="/portal/kunden/$id"
            params={{ id: c.id }}
            className="flex items-center justify-between rounded-2xl bg-surface p-4 gold-hairline"
          >
            <div>
              <p className="font-medium">
                {c.first_name} {c.last_name}
              </p>
              <p className="text-xs text-muted">
                {c.zip} {c.city} · {c.phone}
              </p>
            </div>
            <p className="text-xs text-muted">
              {c.contract_count} Verträge
              {c.active_strom ? " · Strom aktiv" : ""}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
