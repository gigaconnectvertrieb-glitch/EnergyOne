import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listTariffs, quoteCommission } from "@/lib/server/api";
import { Field, Input, Select } from "@/components/ui/field";
import { eur } from "@/lib/utils";
import { formatKwhRange } from "@/lib/tariffs";

export const Route = createFileRoute("/portal/admin/produkte")({ component: Page });

function Page() {
  const [q, setQ] = useState("");
  const [provider, setProvider] = useState("");
  const [type, setType] = useState("");
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof listTariffs>>>({ providers: [], items: [] });
  const [open, setOpen] = useState<string>("");
  const [quote, setQuote] = useState<Awaited<ReturnType<typeof quoteCommission>> | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      listTariffs({ data: { q, provider, type } }).then(setCatalog).catch(() => setCatalog({ providers: [], items: [] }));
    }, 160);
    return () => window.clearTimeout(t);
  }, [q, provider, type]);

  return (
    <div>
      <h1 className="font-display text-4xl">Provisionsliste</h1>
      <p className="text-sm text-muted">
        316 Tarife, 3 Stufen. Verträge gehen in New Sales, hier die Provisionsliste.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Field label="Suche">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tarif oder ID" />
        </Field>
        <Field label="Anbieter">
          <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="">Alle</option>
            {catalog.providers.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </Field>
        <Field label="Sparte">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Alle</option>
            <option value="strom">Strom</option>
            <option value="gas">Gas</option>
          </Select>
        </Field>
      </div>
      <div className="mt-4 grid gap-2">
        {catalog.items.map((t) => (
          <button
            key={t.id}
            type="button"
            className="rounded-2xl bg-surface p-4 text-left gold-hairline"
            onClick={async () => {
              setOpen(t.id);
              setQuote(await quoteCommission({ data: { tariffId: t.id, consumptionKwh: 3500, stufe: 1 } }));
            }}
          >
            <p className="font-medium">{t.name}</p>
            <p className="text-xs text-muted">
              {t.provider} · {t.type === "gas" ? "Gas" : "Strom"} · ID {t.external_id}
            </p>
            {open === t.id && quote?.bands ? (
              <ul className="mt-3 grid gap-1 text-sm">
                {quote.bands.map((b) => (
                  <li key={`${b.stufe}-${b.kwh_from}`} className="flex justify-between text-muted">
                    <span>
                      Stufe {b.stufe} · {formatKwhRange(b.kwh_from, b.kwh_to)}
                    </span>
                    <span className="text-gold">{eur(b.amount_eur)}</span>
                  </li>
                ))}
                <li className="text-xs text-muted">Anzeige Stufe 1 bei 3.500 kWh: {quote.ok ? eur(quote.amount) : "kein Band"}</li>
              </ul>
            ) : null}
          </button>
        ))}
        {catalog.items.length === 0 ? <p className="text-sm text-muted">Keine Tarife zu dieser Suche.</p> : null}
      </div>
    </div>
  );
}
