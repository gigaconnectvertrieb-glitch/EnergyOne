import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { getPublicCalc, submitLead } from "@/lib/server/public";
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
  }, []);

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
        <h1 className="mt-2 font-display text-5xl">Was Sie heute zahlen. Was möglich ist.</h1>
        <p className="mt-4 text-muted">
          Keine 8.000 PLZ abtippen. Sie tragen Arbeitspreis und Grundpreis von der
          letzten Rechnung ein. Die PLZ merken wir für die genaue Kalkulation,
          sobald New Sales den Preis zu Gebiet und Verbrauch liefert.
        </p>
        <p className="mt-2 text-sm text-muted">
          {live ? "Vergleichspreis aus euren hinterlegten Werten." : "Vergleich ist ein Richtwert, kein verbindliches Angebot."}
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
          <Field label="Ihr Arbeitspreis ct/kWh" hint="Steht auf der Jahresrechnung. Nicht raten.">
            <Input inputMode="decimal" value={currentCt} onChange={(e) => setCurrentCt(e.target.value.replace(",", "."))} />
          </Field>
          <Field label="Ihr Grundpreis €/Jahr" hint="Monat × 12, falls nur monatlich gedruckt.">
            <Input inputMode="decimal" value={currentGrund} onChange={(e) => setCurrentGrund(e.target.value.replace(",", "."))} />
          </Field>
          <Field label="PLZ" hint="Für später den Netzpreis. Rechnet heute noch nicht den Endpreis.">
            <Input inputMode="numeric" value={zip} onChange={(e) => setZip(e.target.value.replace(/[^\d]/g, "").slice(0, 5))} />
          </Field>
        </div>

        {result.ok ? (
          <div className="mt-6 rounded-3xl bg-surface p-6 gold-hairline">
            <p className="text-sm text-muted">Unverbindliche Schätzung · {compare.label}</p>
            <p className="mt-2 font-display text-4xl tabular-nums">
              {result.saveYear >= 0 ? `${eur(result.saveYear)} / Jahr` : `${eur(Math.abs(result.saveYear))} teurer`}
            </p>
            <p className="mt-2 text-sm text-muted">
              Heute {eur(result.currentYear)} · Vergleich {eur(result.compareYear)}
              {result.saveYear > 0 ? ` · ca. ${eur(result.saveMonth)} / Monat` : ""}
            </p>
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted">Arbeitspreis von der Rechnung eintragen, dann erscheint die Schätzung.</p>
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
          <p className="text-sm text-muted">Ergebnis prüfen lassen — wir holen den Preis zu Ihrer PLZ.</p>
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
