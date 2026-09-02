import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { getPublicCalc, listPublicE1Tariffs, submitLead } from "@/lib/server/public";
import {
  GEWERBE_KWH,
  PLACEHOLDER_COMPARE,
  PRIVAT_KWH,
  calcSavings,
  type RechnerKind,
  type RechnerSparte,
} from "@/lib/rechner";
import { eur } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/rechner")({ component: Page });

function Page() {
  const [kind, setKind] = useState<RechnerKind>("privat");
  const [sparte, setSparte] = useState<RechnerSparte>("strom");
  const [preset, setPreset] = useState("3");
  const [kwh, setKwh] = useState("3500");
  const [currentCt, setCurrentCt] = useState("");
  const [currentGrund, setCurrentGrund] = useState("");
  const [zip, setZip] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [live, setLive] = useState(false);
  const [cmp, setCmp] = useState(PLACEHOLDER_COMPARE);

  useEffect(() => {
    getPublicCalc()
      .then((c) => {
        setLive(c.live);
        setCmp({
          privat: {
            strom: { arbeitCt: Number(c.privat_strom_ct), grundEurYear: Number(c.privat_strom_grund), label: "Vergleich Strom privat" },
            gas: { arbeitCt: Number(c.privat_gas_ct), grundEurYear: Number(c.privat_gas_grund), label: "Vergleich Gas privat" },
          },
          gewerbe: {
            strom: { arbeitCt: Number(c.gewerbe_strom_ct), grundEurYear: Number(c.gewerbe_strom_grund), label: "Vergleich Strom Gewerbe" },
            gas: { arbeitCt: Number(c.gewerbe_gas_ct), grundEurYear: Number(c.gewerbe_gas_grund), label: "Vergleich Gas Gewerbe" },
          },
        });
      })
      .catch(() => {});
    listPublicE1Tariffs({ data: { type: sparte, kind, kwh: Number(kwh) || 0 } })
      .then((r) => {
        const best = r.items[0];
        if (!best) return;
        setLive(true);
        setCmp((prev) => ({
          ...prev,
          [kind]: {
            ...prev[kind],
            [sparte]: {
              arbeitCt: Number(best.arbeit_ct),
              grundEurYear: Number(best.grund_year),
              label: String(best.name),
            },
          },
        }));
      })
      .catch(() => {});
  }, [kind, sparte, kwh]);

  function applyPreset(nextKind: RechnerKind, key: string) {
    const table = nextKind === "gewerbe" ? GEWERBE_KWH : PRIVAT_KWH;
    const row = table[key];
    if (!row) return;
    setPreset(key);
    setKwh(String(sparte === "gas" ? row.gas : row.strom));
  }

  const compare = cmp[kind][sparte];
  const result = useMemo(
    () =>
      calcSavings({
        kind,
        sparte,
        kwh: Number(kwh) || 0,
        currentArbeitCt: Number(currentCt) || 0,
        currentGrundEurYear: Number(currentGrund) || 0,
        compare,
      }),
    [kind, sparte, kwh, currentCt, currentGrund, compare],
  );

  return (
    <PublicShell>
      <div className="mx-auto max-w-3xl px-4 py-16">
        <p className="text-xs uppercase tracking-[0.28em] text-gold">Tarifrechner</p>
        <h1 className="mt-2 font-display text-5xl">Was kostet Ihr Strom wirklich?</h1>
        <p className="mt-4 text-muted">
          Drei Zahlen von der letzten Rechnung: Verbrauch, Preis pro Kilowattstunde, Grundpreis.
          Darunter steht, was Sie heute zahlen und was Sie sparen könnten.
        </p>

        <div className="mt-8 grid gap-3 rounded-3xl bg-surface p-6 gold-hairline">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Bereich">
              <Select
                value={kind}
                onChange={(e) => {
                  const next = e.target.value === "gewerbe" ? "gewerbe" : "privat";
                  setKind(next);
                  applyPreset(next, next === "gewerbe" ? "klein" : "3");
                }}
              >
                <option value="privat">Privathaushalt</option>
                <option value="gewerbe">Unternehmen</option>
              </Select>
            </Field>
            <Field label="Sparte">
              <Select
                value={sparte}
                onChange={(e) => {
                  const next = e.target.value === "gas" ? "gas" : "strom";
                  setSparte(next);
                  const table = kind === "gewerbe" ? GEWERBE_KWH : PRIVAT_KWH;
                  const row = table[preset];
                  if (row) setKwh(String(next === "gas" ? row.gas : row.strom));
                }}
              >
                <option value="strom">Strom</option>
                <option value="gas">Gas</option>
              </Select>
            </Field>
          </div>
          <Field label="Größe grob">
            <Select
              value={preset}
              onChange={(e) => applyPreset(kind, e.target.value)}
            >
              {Object.entries(kind === "gewerbe" ? GEWERBE_KWH : PRIVAT_KWH).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Jahresverbrauch kWh">
            <Input inputMode="numeric" value={kwh} onChange={(e) => setKwh(e.target.value)} />
          </Field>
          <Field label="Preis pro kWh in Cent" hint="Auf der Jahresrechnung, oft „Arbeitspreis“.">
            <Input inputMode="decimal" value={currentCt} onChange={(e) => setCurrentCt(e.target.value.replace(",", "."))} />
          </Field>
          <Field label="Grundpreis im Jahr in Euro" hint="Steht monatlich da? Einfach mal 12 nehmen.">
            <Input inputMode="decimal" value={currentGrund} onChange={(e) => setCurrentGrund(e.target.value.replace(",", "."))} />
          </Field>
          <Field label="Postleitzahl">
            <Input inputMode="numeric" value={zip} onChange={(e) => setZip(e.target.value.replace(/[^\d]/g, "").slice(0, 5))} />
          </Field>
        </div>

        {result.ok ? (
          <div className="mt-6 rounded-3xl bg-surface p-6 gold-hairline">
            <p className="text-[11px] uppercase tracking-[0.28em] text-gold">Was das heißt</p>
            <dl className="mt-4 grid gap-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">So viel zahlen Sie heute im Jahr</dt>
                <dd className="tabular-nums">{eur(result.currentYear)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">So viel wäre es bei einem günstigeren Tarif</dt>
                <dd className="tabular-nums">{eur(result.compareYear)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-line pt-3">
                <dt className="font-medium">
                  {result.saveYear >= 0 ? "Das könnten Sie sparen" : "Der Vergleich wäre teurer"}
                </dt>
                <dd className="font-display text-2xl tabular-nums text-gold">
                  {eur(Math.abs(result.saveYear))}
                  <span className="ml-1 text-sm font-sans font-normal text-muted">/ Jahr</span>
                </dd>
              </div>
            </dl>
            {result.saveYear > 0 ? (
              <p className="mt-3 text-sm text-muted">
                Das sind etwa {eur(result.saveMonth)} im Monat. Kein Angebot, nur eine Rechnung aus Ihren Angaben.
                Den genauen Preis zu Ihrer PLZ holen wir, wenn Sie uns schreiben.
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted">
                Nach Ihren Zahlen wäre ein Wechsel gerade nicht günstiger. Trotzdem können wir den Standort prüfen.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted">
            Tragen Sie den Arbeitspreis von Ihrer Strom- oder Gasrechnung ein. Dann rechnen wir Jahr und Monat aus.
          </p>
        )}

        <form
          className="mt-8 grid gap-3 rounded-3xl bg-surface p-6 gold-hairline"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await submitLead({
                data: {
                  name: name || "Tarifrechner",
                  phone,
                  zip,
                  consent,
                  kind,
                  message: `${sparte} ${kwh} kWh · Ist ${currentCt} ct + ${currentGrund} €/Jahr · Vergleich ${compare.arbeitCt} ct · Schätzung ${result.saveYear} €`,
                },
              });
              toast.success("Anfrage weg. Wir rechnen das Gebiet dann genau.");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Senden fehlgeschlagen");
            }
          }}
        >
          <p className="text-sm text-muted">Soll jemand von uns das mit Ihrer Adresse nachrechnen?</p>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Telefon">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </Field>
          <label className="flex items-start gap-2 text-sm text-muted">
            <input type="checkbox" className="mt-1 accent-[#c9a227]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            Einwilligung zur Kontaktaufnahme. <Link to="/datenschutz" className="text-gold">Datenschutz</Link>
          </label>
          <Button type="submit">Genau prüfen lassen</Button>
        </form>
      </div>
    </PublicShell>
  );
}
