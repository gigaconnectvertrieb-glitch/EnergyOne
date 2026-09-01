import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { addTaxExpense, deleteTaxExpense, getSteuer, saveSteuerSettings } from "@/lib/server/steuer-api";
import { EXPENSE_CATS, vatOn, type ExpenseCat } from "@/lib/steuer";
import { STEUER_AUSGABEN, STEUER_FRISTEN, STEUER_KENNZAHLEN, STEUER_PFLICHTEN } from "@/lib/steuer-wissen";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { deDate, eur } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/steuern")({ component: Page });

function today() {
  return new Date().toISOString().slice(0, 10);
}

function Page() {
  const [tab, setTab] = useState<"buch" | "agentur" | "kompass">("buch");
  const [data, setData] = useState<Awaited<ReturnType<typeof getSteuer>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    spentOn: today(),
    category: "sprit" as ExpenseCat,
    amount: "",
    vatRate: "19",
    gross: true,
    km: "",
    note: "",
    cadence: "einmal" as "einmal" | "monat" | "jahr",
    scope: "user" as "user" | "agency",
  });

  function load() {
    getSteuer().then(setData).catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Steuerbuch fehlt"));
  }
  useEffect(load, []);

  async function saveExp(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await addTaxExpense({
        data: {
          spentOn: form.spentOn,
          category: form.category,
          amount: Number(String(form.amount).replace(",", ".")),
          vatRate: Number(form.vatRate) / 100,
          gross: form.gross,
          km: form.category === "km" ? Number(String(form.km).replace(",", ".")) : undefined,
          note: form.note,
          cadence: form.cadence,
          scope: tab === "agentur" ? "agency" : form.scope,
        },
      });
      toast.success("Gebucht");
      setForm((f) => ({ ...f, amount: "", km: "", note: "" }));
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Buchen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <div className="h-48 animate-pulse rounded-3xl bg-surface" />;

  return (
    <div className="mx-auto max-w-3xl pb-16">
      <p className="text-xs uppercase tracking-[0.2em] text-gold">Einzelunternehmen {data.year}</p>
      <h1 className="mt-1 font-display text-4xl">Steuer</h1>
      <p className="mt-2 text-sm text-muted">
        Tanken, KV, IHK und den Rest eintragen — dann siehst du, was von der Provision wirklich bleibt.
        19 % USt und ESt werden zurückgelegt, nicht ausgegeben. Fixkosten monatlich oder jährlich.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant={tab === "buch" ? "default" : "outline"} onClick={() => setTab("buch")}>
          Mein Buch
        </Button>
        {data.canAgency ? (
          <Button variant={tab === "agentur" ? "default" : "outline"} onClick={() => setTab("agentur")}>
            Agentur
          </Button>
        ) : null}
        <Button variant={tab === "kompass" ? "default" : "outline"} onClick={() => setTab("kompass")}>
          Steuerkompass
        </Button>
      </div>

      {tab === "buch" ? (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Kpi t="Provision ausgezahlt" v={eur(data.paid)} h={`netto · brutto ${eur(data.kleinunternehmer ? data.paid : vatOn(data.paid).gross)} · offen ${eur(data.offen)}`} />
            <Kpi t="Ausgaben (Cash)" v={eur(data.cash)} h={`davon BA ${eur(data.ba)}`} />
            <Kpi t="Zurücklegen USt + ESt" v={eur(data.ustSetAside + data.estSetAside)} h={data.kleinunternehmer ? "Kleinunternehmer: keine USt" : `USt ${eur(data.ustSetAside)}`} />
            <Kpi t="Noch übrig" v={eur(data.leftover)} h="nach Ausgaben und Steuerrücklage" gold />
          </div>

          <div className="mt-6 rounded-3xl bg-surface p-5 gold-hairline">
            <p className="text-xs uppercase tracking-[0.16em] text-gold">Erinnerungen</p>
            <ul className="mt-3 grid gap-2">
              {data.reminders.map((r) => (
                <li key={r.key} className="text-sm">
                  <span className={r.tone === "warn" ? "text-warn" : "text-ink"}>{r.title}</span>
                  <span className="text-muted"> · {deDate(r.due)} · {r.hint}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6 rounded-3xl bg-surface p-5 gold-hairline">
            <p className="text-xs uppercase tracking-[0.16em] text-gold">ELSTER · USt-VA {data.elster.quarter}</p>
            <p className="mt-2 text-sm text-muted">
              Keine direkte Anbindung an das Finanzamt. ELSTER nimmt nur zertifizierte Steuersoftware (ERiC).
              Hier die Kennzahlen zum Eintragen in{" "}
              <a href={data.elster.url} className="text-gold" target="_blank" rel="noreferrer">
                mein.elster.de
              </a>
              .
            </p>
            {data.kleinunternehmer ? (
              <p className="mt-3 text-sm">Kleinunternehmer: keine USt-VA, solange die Grenzen gehalten werden.</p>
            ) : (
              <ul className="mt-3 grid gap-1 text-sm">
                <li>Kz 81 Bemessungsgrundlage 19 % · {eur(data.elster.kz81)}</li>
                <li>Kz 66 Vorsteuer · {eur(data.elster.kz66)}</li>
                <li>Kz 83 Zahllast · {eur(data.elster.kz83)}</li>
                <li className="text-muted">
                  Zeitraum {deDate(data.elster.from)} – {deDate(data.elster.to)}
                </li>
              </ul>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const blob = new Blob(["\uFEFF" + data.elster.csv], { type: "text/csv;charset=utf-8" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `E1-ELSTER-${data.elster.quarter.replace(/\s+/g, "-")}.csv`;
                  a.click();
                }}
              >
                ELSTER-CSV
              </Button>
              <a href={data.elster.url} target="_blank" rel="noreferrer">
                <Button type="button" size="sm">
                  Zu ElsterOnline
                </Button>
              </a>
            </div>
          </div>

          <form className="mt-6 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline" onSubmit={saveExp}>
            <p className="text-xs uppercase tracking-[0.16em] text-gold">Ausgabe buchen</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Datum">
                <Input type="date" value={form.spentOn} onChange={(e) => setForm({ ...form, spentOn: e.target.value })} required />
              </Field>
              <Field label="Art">
                <Select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCat })}
                >
                  {(Object.keys(EXPENSE_CATS) as ExpenseCat[]).map((k) => (
                    <option key={k} value={k}>
                      {EXPENSE_CATS[k].label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {form.category === "km" ? (
              <Field label="Kilometer">
                <Input inputMode="decimal" value={form.km} onChange={(e) => setForm({ ...form, km: e.target.value })} placeholder="z. B. 120" />
              </Field>
            ) : (
              <Field label="Betrag EUR">
                <Input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
              </Field>
            )}
            {form.category !== "km" && form.category !== "krankenkasse" && form.category !== "rente" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="USt">
                  <Select value={form.vatRate} onChange={(e) => setForm({ ...form, vatRate: e.target.value })}>
                    <option value="0">0 %</option>
                    <option value="7">7 %</option>
                    <option value="19">19 %</option>
                  </Select>
                </Field>
                <Field label="Betrag ist">
                  <Select
                    value={form.gross ? "brutto" : "netto"}
                    onChange={(e) => setForm({ ...form, gross: e.target.value === "brutto" })}
                  >
                    <option value="brutto">brutto (inkl. USt)</option>
                    <option value="netto">netto</option>
                  </Select>
                </Field>
              </div>
            ) : null}
            <Field label="Notiz">
              <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Tankstelle, Belegnr. …" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Rhythmus">
                <Select value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value as typeof form.cadence })}>
                  <option value="einmal">Einmal</option>
                  <option value="monat">Monatlich (Fixkosten)</option>
                  <option value="jahr">Jährlich</option>
                </Select>
              </Field>
              {data.canAgency && tab === "buch" ? (
                <Field label="Buch">
                  <Select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as "user" | "agency" })}>
                    <option value="user">Privat / HV</option>
                    <option value="agency">Agentur</option>
                  </Select>
                </Field>
              ) : null}
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Speichert…" : "Buchen"}
            </Button>
          </form>

          <div className="mt-6 grid gap-2">
            {data.expenses.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 gold-hairline">
                <div>
                  <p className="font-medium">{e.label}</p>
                  <p className="text-xs text-muted">
                    {deDate(e.spent_on)}
                    {e.cadence === "monat" ? " · monatlich" : e.cadence === "jahr" ? " · jährlich" : ""}
                    {e.km ? ` · ${e.km} km` : ""}
                    {e.note ? ` · ${e.note}` : ""}
                    {e.private ? " · Sonderausgabe" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="tabular-nums text-gold">{eur(e.amount)}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-danger"
                    onClick={async () => {
                      await deleteTaxExpense({ data: { id: e.id } });
                      load();
                    }}
                  >
                    Weg
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <form
            className="mt-8 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await saveSteuerSettings({
                  data: {
                    kleinunternehmer: data.kleinunternehmer,
                    dauerfrist: data.dauerfrist,
                    steuerberater: data.steuerberater,
                    steuernummer: data.steuernummer,
                    notes: data.notes,
                  },
                });
                toast.success("Einstellungen");
                load();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
              }
            }}
          >
            <p className="text-xs uppercase tracking-[0.16em] text-gold">Dein Status</p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-5 accent-[#c9a227]"
                checked={data.kleinunternehmer}
                onChange={(e) => setData({ ...data, kleinunternehmer: e.target.checked })}
              />
              Kleinunternehmer (§ 19 UStG)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-5 accent-[#c9a227]"
                checked={data.dauerfrist}
                onChange={(e) => setData({ ...data, dauerfrist: e.target.checked })}
              />
              Dauerfristverlängerung USt
            </label>
            <Field label="Steuernummer">
              <Input
                value={data.steuernummer}
                onChange={(e) => setData({ ...data, steuernummer: e.target.value })}
                placeholder="für ELSTER-CSV"
              />
            </Field>
            <Field label="Steuerberater">
              <Input
                value={data.steuerberater}
                onChange={(e) => setData({ ...data, steuerberater: e.target.value })}
                placeholder="Name / Kanzlei"
              />
            </Field>
            <Field label="Notiz an dich">
              <Textarea value={data.notes} onChange={(e) => setData({ ...data, notes: e.target.value })} />
            </Field>
            <Button type="submit" variant="outline">
              Status speichern
            </Button>
          </form>
        </>
      ) : tab === "agentur" ? (
        <Agentur data={data} form={form} setForm={setForm} busy={busy} saveExp={saveExp} load={load} />
      ) : (
        <Kompass />
      )}
    </div>
  );
}

function Kpi({ t, v, h, gold }: { t: string; v: string; h: string; gold?: boolean }) {
  return (
    <div className="rounded-3xl bg-surface p-5 gold-hairline">
      <p className="text-xs uppercase tracking-[0.16em] text-muted">{t}</p>
      <p className={`mt-2 font-display text-3xl ${gold ? "text-gold" : ""}`}>{v}</p>
      <p className="mt-1 text-xs text-muted">{h}</p>
    </div>
  );
}

function Agentur({
  data,
  form,
  setForm,
  busy,
  saveExp,
  load,
}: {
  data: NonNullable<Awaited<ReturnType<typeof getSteuer>>>;
  form: {
    spentOn: string;
    category: ExpenseCat;
    amount: string;
    vatRate: string;
    gross: boolean;
    km: string;
    note: string;
    cadence: "einmal" | "monat" | "jahr";
    scope: "user" | "agency";
  };
  setForm: (next: typeof form | ((p: typeof form) => typeof form)) => void;
  busy: boolean;
  saveExp: (e: FormEvent) => Promise<void>;
  load: () => void;
}) {
  const ag = data.agency;
  if (!ag) {
    return <p className="mt-6 text-sm text-muted">Agentur-Zahlen erscheinen, sobald Verträge mit Stufe-13-Split vorliegen.</p>;
  }
  return (
    <>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Kpi t="New Sales Stufe 13" v={eur(ag.gross)} h={`netto · brutto ${eur(vatOn(ag.gross).gross)} — was New Sales der Agentur zahlt`} />
        <Kpi t="An Mitarbeiter" v={eur(ag.advisor)} h={`netto · brutto ${eur(vatOn(ag.advisor).gross)}`} />
        <Kpi t="E1-Marge" v={eur(ag.margin)} h={`netto · brutto ${eur(vatOn(ag.margin).gross)} · Fix ${eur(ag.fix)}`} />
        <Kpi t="Übrig nach Steuer" v={eur(ag.leftover)} h={`USt ${eur(ag.ustSetAside)} (oben drauf) · ESt ${eur(ag.estSetAside)}`} gold />
      </div>
      <form className="mt-6 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline" onSubmit={saveExp}>
        <p className="text-xs uppercase tracking-[0.16em] text-gold">Agentur-Fixkosten</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Datum">
            <Input type="date" value={form.spentOn} onChange={(e) => setForm({ ...form, spentOn: e.target.value })} required />
          </Field>
          <Field label="Art">
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCat })}>
              {(Object.keys(EXPENSE_CATS) as ExpenseCat[]).map((k) => (
                <option key={k} value={k}>
                  {EXPENSE_CATS[k].label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Betrag EUR">
          <Input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Rhythmus">
            <Select value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value as typeof form.cadence })}>
              <option value="einmal">Einmal</option>
              <option value="monat">Monatlich</option>
              <option value="jahr">Jährlich</option>
            </Select>
          </Field>
          <Field label="Notiz">
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Miete, Software, Büro…" />
          </Field>
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Speichert…" : "Auf Agentur buchen"}
        </Button>
      </form>
      <div className="mt-6 grid gap-2">
        {ag.expenses.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 gold-hairline">
            <div>
              <p className="font-medium">{e.label}</p>
              <p className="text-xs text-muted">
                {deDate(e.spent_on)}
                {e.cadence === "monat" ? " · monatlich" : e.cadence === "jahr" ? " · jährlich" : ""}
                {e.note ? ` · ${e.note}` : ""}
                {e.cadence === "monat" ? ` · Jahr ${eur(e.yearAmount)}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <p className="tabular-nums text-gold">{eur(e.amount)}</p>
              <Button
                variant="outline"
                size="sm"
                className="text-danger"
                onClick={async () => {
                  await deleteTaxExpense({ data: { id: e.id } });
                  load();
                }}
              >
                Weg
              </Button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Kompass() {
  return (
    <div className="mt-6 grid gap-6">
      <p className="text-sm text-muted">
        Steuerkompass für Handelsvertreter mit Einzelunternehmen. Gewerbliche Vermittlung nach § 84 HGB
        (Strom, Gas, Telekom im Außendienst). Stand August 2026. Kein Steuerbescheid — bei Unsicherheit den Berater fragen.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {STEUER_KENNZAHLEN.map((x) => (
          <div key={x.k} className="rounded-2xl bg-surface p-4 gold-hairline">
            <p className="text-xs uppercase tracking-[0.14em] text-gold">{x.k}</p>
            <p className="mt-1 text-sm">{x.v}</p>
          </div>
        ))}
      </div>
      <section>
        <h2 className="font-display text-2xl">A · Pflichten</h2>
        <ul className="mt-3 grid gap-3">
          {STEUER_PFLICHTEN.map((p) => (
            <li key={p.t} className="rounded-2xl bg-surface p-4 gold-hairline">
              <p className="font-medium">{p.t}</p>
              <p className="mt-1 text-sm text-muted">{p.b}</p>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-display text-2xl">B · Betriebsausgaben</h2>
        <div className="mt-3 grid gap-3">
          {STEUER_AUSGABEN.map((g) => (
            <div key={g.g} className="rounded-2xl bg-surface p-4 gold-hairline">
              <p className="font-medium">{g.g}</p>
              <ul className="mt-2 list-disc pl-4 text-sm text-muted">
                {g.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2 className="font-display text-2xl">C · Fristen</h2>
        <div className="mt-3 overflow-x-auto rounded-2xl bg-surface p-4 gold-hairline">
          <table className="w-full text-left text-sm">
            <tbody>
              {STEUER_FRISTEN.map(([a, b]) => (
                <tr key={a} className="border-b border-line last:border-0">
                  <td className="py-2 pr-3 font-medium">{a}</td>
                  <td className="py-2 text-muted">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-xs text-muted">
        Quelle: gesetzliche Werte 2025/2026 (UStG, EStG, GewStG, SGB VI). Kein Ersatz für Steuerberatung.{" "}
        <Link to="/portal/wissen" className="text-gold">
          Wissen
        </Link>
      </p>
    </div>
  );
}
