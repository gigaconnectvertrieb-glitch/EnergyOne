import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listCommissions, setCommissionStatus } from "@/lib/server/api";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { deDate, eur } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/provisionen")({ component: Page });

function Page() {
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listCommissions>>>([]);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  function load() {
    listCommissions({ data: { status: status || undefined } }).then(setRows);
  }
  useEffect(load, [status]);
  const chosen = rows.filter((r) => sel[r.id]).map((r) => r.id);

  async function act(s: "freigegeben" | "ausgezahlt") {
    try {
      await setCommissionStatus({ data: { ids: chosen, status: s } });
      toast.success("Aktualisiert");
      setSel({});
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Keine Berechtigung");
    }
  }

  function exportCsv() {
    const header = "Datum;Berater;Typ;Produkt;Betrag;Status";
    const body = rows
      .map(
        (r) =>
          `${deDate(r.calculated_at)};${r.advisor};${r.type};${r.product_name};${r.amount};${r.status}`,
      )
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "provisionen.csv";
    a.click();
  }

  const sum = rows.reduce((a, r) => a + r.amount, 0);

  return (
    <div>
      <h1 className="font-display text-4xl">Provisionen</h1>
      <p className="text-sm text-muted">Summe dieser Ansicht: {eur(sum)}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-xs">
          <option value="">Alle</option>
          <option value="offen">Offen</option>
          <option value="freigegeben">Freigegeben</option>
          <option value="ausgezahlt">Ausgezahlt</option>
          <option value="storniert">Storniert</option>
        </Select>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          CSV exportieren
        </Button>
        <Button variant="outline" size="sm" disabled={!chosen.length} onClick={() => void act("freigegeben")}>
          Freigeben
        </Button>
        <Button size="sm" disabled={!chosen.length} onClick={() => void act("ausgezahlt")}>
          Als ausgezahlt
        </Button>
      </div>
      <div className="mt-4 grid gap-2">
        {rows.map((r) => (
          <label key={r.id} className="flex items-center gap-3 rounded-2xl bg-surface p-4 gold-hairline">
            <input
              type="checkbox"
              checked={!!sel[r.id]}
              onChange={(e) => setSel((s) => ({ ...s, [r.id]: e.target.checked }))}
              className="size-5 accent-[#c9a227]"
            />
            <div className="flex-1">
              <p className="font-medium">
                {r.advisor} · {r.type}
              </p>
              <p className="text-xs text-muted">
                {r.product_name} · {deDate(r.calculated_at)} · {r.status}
              </p>
            </div>
            <p className="tabular-nums text-gold">{eur(r.amount)}</p>
          </label>
        ))}
      </div>
    </div>
  );
}
