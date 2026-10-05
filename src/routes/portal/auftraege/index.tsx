/**
 * E1 Aufträge – Liste
 * -------------------
 * Pipeline aus E1-Erfassung. Filter, Suche, Übergang an New Sales.
 *
 * Ersetzt: src/routes/portal/auftraege/index.tsx
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listContracts, exportOpsCsv, sendParkedContract } from "@/lib/server/api";
import { STATUSES, STATUS_LABELS, type ContractStatus } from "@/lib/e1";
import { deDate, eur } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import { Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";

export const Route = createFileRoute("/portal/auftraege/")({ component: Page });

function Page() {
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listContracts>>>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    listContracts({ data: { status: status || undefined, type: type || undefined, q } })
      .then(setRows)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Fehler"));
  }

  useEffect(() => {
    load();
  }, [status, type, q]);

  const readyForNewsales = rows.filter(
    (r) =>
      r.status === "erfasst" ||
      r.status === "in_pruefung" ||
      (r as { source?: string }).source === "e1_to_newsales" ||
      (r as { source?: string }).source === "geparkt",
  );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-gold">Pipeline</p>
          <h1 className="mt-1 font-display text-4xl">Aufträge</h1>
          <p className="mt-1 text-sm text-muted">
            Bei E1 erfasst · an New Sales übergeben · Status nachverfolgen
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_8rem_9rem_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            className="pl-9"
            placeholder="Name, Adresse, Tarif…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Sparte</option>
          <option value="strom">Strom</option>
          <option value="gas">Gas</option>
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Alle Status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s as ContractStatus]}
            </option>
          ))}
        </Select>
        <Button
          variant="outline"
          type="button"
          onClick={async () => {
            try {
              const file = await exportOpsCsv({ data: "auftraege" });
              const blob = new Blob([`\uFEFF${file.csv}`], {
                type: "text/csv;charset=utf-8",
              });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = file.filename;
              a.click();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Export fehlgeschlagen");
            }
          }}
        >
          Excel
        </Button>
      </div>

      {/* Hinweis geparkte / bereit */}
      {readyForNewsales.length > 0 && !status && (
        <p className="mt-4 text-sm text-muted">
          <span className="text-gold tabular-nums">{readyForNewsales.length}</span>{" "}
          bereit zur Übergabe oder geparkt
        </p>
      )}

      {err && <p className="mt-4 text-danger">{err}</p>}

      {/* Liste */}
      <ul className="mt-4 space-y-2">
        {rows.length === 0 && !err && (
          <li className="rounded-2xl bg-surface p-8 text-center text-sm text-muted gold-hairline">
            Keine Aufträge.
          </li>
        )}
        {rows.map((r) => {
          const name =
            (r as { customer_name?: string }).customer_name ||
            [ (r as { first_name?: string }).first_name, (r as { last_name?: string }).last_name ]
              .filter(Boolean)
              .join(" ") ||
            "Kunde";
          const addr =
            (r as { address?: string }).address ||
            [
              (r as { street?: string }).street,
              (r as { house_number?: string }).house_number,
              (r as { zip?: string }).zip,
              (r as { city?: string }).city,
            ]
              .filter(Boolean)
              .join(" ");
          const canSend =
            r.status === "erfasst" ||
            r.status === "in_pruefung" ||
            (r as { source?: string }).source === "e1_to_newsales";

          return (
            <li key={r.id} className="rounded-2xl bg-surface gold-hairline">
              <Link
                to="/portal/auftraege/$id"
                params={{ id: r.id }}
                className="flex flex-col gap-1 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{name}</p>
                  <p className="truncate text-xs text-muted">
                    {addr}
                    {r.type ? ` · ${r.type}` : ""}
                    {r.created_at ? ` · ${deDate(r.created_at)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {(r as { commission_amount?: number }).commission_amount != null && (
                    <span className="text-xs tabular-nums text-muted">
                      {eur(Number((r as { commission_amount?: number }).commission_amount))}
                    </span>
                  )}
                  <StatusBadge status={r.status as ContractStatus} />
                </div>
              </Link>
              {canSend && (
                <div className="border-t border-line px-4 py-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 text-xs"
                    disabled={busyId === r.id}
                    onClick={async (e) => {
                      e.preventDefault();
                      setBusyId(r.id);
                      try {
                        await sendParkedContract({ data: { id: r.id } });
                        toast.success("An New Sales übergeben");
                        load();
                      } catch (err) {
                        toast.error(
                          err instanceof Error ? err.message : "Übergabe fehlgeschlagen",
                        );
                      } finally {
                        setBusyId(null);
                      }
                    }}
                  >
                    {busyId === r.id ? "Sendet…" : "An New Sales senden"}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
