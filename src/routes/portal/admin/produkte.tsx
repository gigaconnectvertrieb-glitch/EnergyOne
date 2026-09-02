import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listE1OwnTariffs, listTariffs, quoteCommission, saveE1OwnTariff } from "@/lib/server/api";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { eur } from "@/lib/utils";
import { vatOn } from "@/lib/steuer";
import { formatKwhRange } from "@/lib/tariffs";

export const Route = createFileRoute("/portal/admin/produkte")({ component: Page });

function Page() {
  const [q, setQ] = useState("");
  const [provider, setProvider] = useState("");
  const [type, setType] = useState("");
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof listTariffs>>>({ providers: [], items: [] });
  const [open, setOpen] = useState<string>("");
  const [quote, setQuote] = useState<Awaited<ReturnType<typeof quoteCommission>> | null>(null);
  const [own, setOwn] = useState<Awaited<ReturnType<typeof listE1OwnTariffs>>>([]);

  useEffect(() => {
    listE1OwnTariffs().then(setOwn).catch(() => setOwn([]));
  }, []);

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
        New Sales plus eigene E1-Tarife. Website-Buchung zählt volle Stufe 13 an die Gründer.
      </p>

      <h2 className="mt-8 font-display text-2xl">E1 eigene Tarife</h2>
      <p className="text-sm text-muted">
        Arbeitspreis und Grundpreis eintragen, aktiv und auf Website buchbar. Flag Eigene E1-Tarife in den Einstellungen an.
      </p>
      <div className="mt-3 grid gap-3">
        {own.map((t) => (
          <E1Editor
            key={String(t.id)}
            row={t}
            onSaved={() => listE1OwnTariffs().then(setOwn).catch(() => setOwn([]))}
          />
        ))}
      </div>
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
                    <span className="text-gold">{eur(b.amount_eur)} netto</span>
                  </li>
                ))}
                <li className="text-xs text-muted">
                  Stufe 1 bei 3.500 kWh: {quote.ok ? `${eur(quote.advisor)} netto / ${eur(quote.gross ?? vatOn(quote.advisor).gross)} brutto` : "kein Band"}
                  {quote.ok && quote.margin > 0 ? ` · Agentur ${eur(quote.agency)} · Marge ${eur(quote.margin)}` : ""}
                </li>
                <li className="text-[11px] text-muted">Liste netto, zzgl. 19 % USt</li>
              </ul>
            ) : null}
          </button>
        ))}
        {catalog.items.length === 0 ? <p className="text-sm text-muted">Keine Tarife zu dieser Suche.</p> : null}
      </div>
    </div>
  );
}

function E1Editor({
  row,
  onSaved,
}: {
  row: Record<string, unknown>;
  onSaved: () => void;
}) {
  const [ct, setCt] = useState(row.arbeit_ct != null ? String(row.arbeit_ct) : "");
  const [grund, setGrund] = useState(row.grund_year != null ? String(row.grund_year) : "");
  const [bonus, setBonus] = useState(String(row.bonus_year || 0));
  const [active, setActive] = useState(Boolean(row.active));
  const [web, setWeb] = useState(Boolean(row.web_bookable));
  return (
    <div className="rounded-2xl bg-surface p-4 gold-hairline">
      <p className="font-medium">{String(row.name)}</p>
      <p className="text-xs text-muted">
        {String(row.type)} · {String(row.kind)}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Field label="ct/kWh">
          <Input value={ct} onChange={(e) => setCt(e.target.value.replace(/[^\d,.]/g, ""))} />
        </Field>
        <Field label="Grundpreis EUR/Jahr">
          <Input value={grund} onChange={(e) => setGrund(e.target.value.replace(/[^\d,.]/g, ""))} />
        </Field>
        <Field label="Bonus EUR/Jahr">
          <Input value={bonus} onChange={(e) => setBonus(e.target.value.replace(/[^\d,.]/g, ""))} />
        </Field>
      </div>
      <label className="mt-2 flex gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Aktiv
      </label>
      <label className="flex gap-2 text-sm">
        <input type="checkbox" checked={web} onChange={(e) => setWeb(e.target.checked)} /> Auf der Website buchbar
      </label>
      <Button
        className="mt-3"
        size="sm"
        onClick={async () => {
          await saveE1OwnTariff({
            data: {
              id: String(row.id),
              arbeit_ct: Number(ct.replace(",", ".")),
              grund_year: Number(grund.replace(",", ".")),
              bonus_year: Number(bonus.replace(",", ".")) || 0,
              active,
              web_bookable: web,
            },
          });
          onSaved();
        }}
      >
        Speichern
      </Button>
    </div>
  );
}
