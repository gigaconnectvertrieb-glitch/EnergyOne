import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listContracts, exportOpsCsv, sendParkedContract } from "@/lib/server/api";
import { STATUSES, STATUS_LABELS, type ContractStatus } from "@/lib/e1";
import { deDate } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import { Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/auftraege/")({ component: Page });

function Page() {
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listContracts>>>([]);
  const [err, setErr] = useState<string | null>(null);

  function load() {
    listContracts({ data: { status: status || undefined, type: type || undefined, q } })
      .then(setRows)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Fehler"));
  }

  useEffect(() => {
    load();
  }, [status, type, q]);

  const parked = rows.filter((r) => r.status === "erfasst" || r.source === "geparkt");

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl">Aufträge</h1>
          <p className="text-sm text-muted">Kurzliste aus dem Portal. Verträge selbst stehen in New Sales.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            type="button"
            onClick={async () => {
              try {
                const file = await exportOpsCsv({ data: "auftraege" });
                const blob = new Blob([`\uFEFF${file.csv}`], { type: "text/csv;charset=utf-8" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = file.filename;
                a.click();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Excel fehlgeschlagen");
              }
            }}
          >
            Excel (eine Tabelle)
          </Button>
          <Link to="/portal/auftraege/neu" className="rounded-xl bg-gold px-4 py-3 text-sm font-medium text-bg">
            Eintrag
          </Link>
        </div>
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        <Input placeholder="Suche Name, PLZ, Zähler…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Alle Status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Strom & Gas</option>
          <option value="strom">Strom</option>
          <option value="gas">Gas</option>
        </Select>
      </div>
      {parked.length ? (
        <div className="mt-6">
          <h2 className="font-display text-2xl">Geparkt</h2>
          <div className="mt-3 grid gap-2">
            {parked.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface px-4 py-3 gold-hairline">
                <div>
                  <p className="font-medium">{r.customer_name}</p>
                  <p className="text-xs text-muted">
                    {r.product_name} · {r.zip} {r.city}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    to="/portal/auftraege/$id"
                    params={{ id: r.id }}
                    className="rounded-xl border border-line px-3 py-2 text-sm"
                  >
                    Bearbeiten
                  </Link>
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await sendParkedContract({ data: { id: r.id } });
                        toast.success("Gesendet");
                        load();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Senden fehlgeschlagen");
                      }
                    }}
                  >
                    Senden
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-4 hidden overflow-x-auto rounded-2xl bg-surface gold-hairline md:block">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Kunde</th>
              <th>Produkt</th>
              <th>Status</th>
              <th>Berater</th>
              <th>Datum</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line hover:bg-elevated">
                <td className="px-4 py-3">
                  <Link to="/portal/auftraege/$id" params={{ id: r.id }} className="font-medium">
                    {r.customer_name}
                  </Link>
                  <div className="text-xs text-muted">
                    {r.zip} {r.city} · {r.type}
                  </div>
                </td>
                <td>{r.product_name}</td>
                <td>
                  <StatusBadge status={r.status as ContractStatus} />
                </td>
                <td className="text-muted">{r.advisor_name}</td>
                <td className="text-muted">{deDate(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid gap-2 md:hidden">
        {rows.map((r) => (
          <Link
            key={r.id}
            to="/portal/auftraege/$id"
            params={{ id: r.id }}
            className="rounded-2xl bg-surface p-4 gold-hairline"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{r.customer_name}</p>
                <p className="text-xs text-muted">
                  {r.product_name} · {r.zip} {r.city}
                </p>
              </div>
              <StatusBadge status={r.status as ContractStatus} />
            </div>
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted">Keine Aufträge in dieser Ansicht.</p>
      ) : null}
    </div>
  );
}
