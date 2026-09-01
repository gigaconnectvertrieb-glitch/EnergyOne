import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listCommissions, setCommissionStatus } from "@/lib/server/api";
import { cancelPayout, executePayout, listPayoutRuns, planPayout, payoutCsv } from "@/lib/server/payout-api";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { deDate, eur } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/provisionen")({ component: Page });

function plusDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function downloadCsv(filename: string, csv: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = filename;
  a.click();
}

function Page() {
  const [status, setStatus] = useState("freigegeben");
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listCommissions>>>([]);
  const [runs, setRuns] = useState<Awaited<ReturnType<typeof listPayoutRuns>>>([]);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [when, setWhen] = useState(plusDays(7));
  const [busy, setBusy] = useState(false);

  function load() {
    listCommissions({ data: { status: status || undefined } }).then(setRows).catch(() => setRows([]));
    listPayoutRuns().then(setRuns).catch(() => setRuns([]));
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

  async function plan() {
    setBusy(true);
    try {
      const res = await planPayout({ data: { ids: chosen, scheduledFor: when } });
      toast.success(`${res.title} · ${res.items} Positionen`);
      setSel({});
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Planen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const header = "Datum;Berater;Typ;Produkt;Betrag;Status";
    const body = rows
      .map((r) => `${deDate(r.calculated_at)};${r.advisor};${r.type};${r.product_name};${r.amount};${r.status}`)
      .join("\n");
    downloadCsv("provisionen.csv", `${header}\n${body}`);
  }

  const sum = rows.reduce((a, r) => a + r.amount, 0);
  const runLabel: Record<string, string> = {
    geplant: "Geplant",
    ausgefuehrt: "Durchgeführt",
    storniert: "Gestrichen",
  };

  return (
    <div>
      <h1 className="font-display text-4xl">Provisionen</h1>
      <p className="text-sm text-muted">
        Freigeben, Auszahlung auf einen Termin legen, am Stichtag durchführen. Summe dieser Ansicht: {eur(sum)}.
        Bei der Auszahlung bekommt jeder einen Hinweis, wie viel für USt, ESt und Fixkosten zur Seite gelegt werden soll.
      </p>

      <h2 className="mt-8 font-display text-2xl">Auszahlungsläufe</h2>
      <div className="mt-3 grid gap-2">
        {runs.map((r) => (
          <div key={r.id} className="rounded-2xl bg-surface p-4 gold-hairline">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{r.title}</p>
                <p className="text-xs text-muted">
                  Termin {deDate(r.scheduled_for)} · {r.items} Positionen · {eur(r.total)} · {runLabel[r.status] || r.status}
                  {r.executed_at ? ` · ausgeführt ${deDate(r.executed_at)}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const file = await payoutCsv({ data: { id: r.id } });
                      downloadCsv(file.filename, file.csv);
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "CSV fehlgeschlagen");
                    }
                  }}
                >
                  CSV
                </Button>
                {r.status === "geplant" ? (
                  <>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={async () => {
                        if (!window.confirm(`${r.title} jetzt auszahlen?`)) return;
                        setBusy(true);
                        try {
                          await executePayout({ data: { id: r.id } });
                          toast.success("Auszahlung durchgeführt");
                          load();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Ausführen fehlgeschlagen");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Durchführen
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-danger"
                      onClick={async () => {
                        if (!window.confirm("Lauf streichen? Positionen werden wieder frei.")) return;
                        try {
                          await cancelPayout({ data: { id: r.id } });
                          toast.success("Gestrichen");
                          load();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Streichen fehlgeschlagen");
                        }
                      }}
                    >
                      Streichen
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        ))}
        {runs.length === 0 ? (
          <p className="text-sm text-muted">Noch kein Lauf. Unten freigegebene Positionen wählen und terminieren.</p>
        ) : null}
      </div>

      <div className="mt-8 flex flex-wrap items-end gap-2">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-xs">
          <option value="">Alle</option>
          <option value="offen">Offen</option>
          <option value="freigegeben">Freigegeben</option>
          <option value="ausgezahlt">Ausgezahlt</option>
          <option value="storniert">Storniert</option>
        </Select>
        <Field label="Auszahlungstermin">
          <Input type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          CSV exportieren
        </Button>
        <Button variant="outline" size="sm" disabled={!chosen.length} onClick={() => void act("freigegeben")}>
          Freigeben
        </Button>
        <Button size="sm" disabled={!chosen.length || busy} onClick={() => void plan()}>
          Terminieren
        </Button>
        <Button variant="outline" size="sm" disabled={!chosen.length} onClick={() => void act("ausgezahlt")}>
          Sofort als ausgezahlt
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
                {r.paid_at ? ` · gezahlt ${deDate(r.paid_at)}` : ""}
              </p>
            </div>
            <p className="tabular-nums text-gold">{eur(r.amount)}</p>
          </label>
        ))}
      </div>
    </div>
  );
}
