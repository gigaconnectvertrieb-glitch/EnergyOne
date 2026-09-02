import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { listPublicE1Tariffs, submitE1WebOrder } from "@/lib/server/public";
import { eur } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/buchen")({ component: Page });

function Block({ step, title, children }: { step: string; title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl bg-surface/80 p-6 md:p-8 gold-hairline">
      <p className="text-[11px] uppercase tracking-[0.28em] text-gold">{step}</p>
      <h2 className="mt-2 font-display text-2xl">{title}</h2>
      <div className="mt-6 grid gap-5">{children}</div>
    </section>
  );
}

function Page() {
  const kind = "privat";
  const [type, setType] = useState("strom");
  const [kwh, setKwh] = useState("3500");
  const [items, setItems] = useState<Awaited<ReturnType<typeof listPublicE1Tariffs>>["items"]>([]);
  const [tariffId, setTariffId] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [house, setHouse] = useState("");
  const [zip, setZip] = useState("");
  const [city, setCity] = useState("");
  const [consent, setConsent] = useState(false);
  const [providerOld, setProviderOld] = useState("");
  const [prevNo, setPrevNo] = useState("");
  const [meter, setMeter] = useState("");
  const [kuendigen, setKuendigen] = useState(true);
  const [iban, setIban] = useState("");
  const [sepa, setSepa] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listPublicE1Tariffs({ data: { type, kind, kwh: Number(kwh) || 0 } })
      .then((r) => {
        setItems(r.items);
        const pick = r.items.find((i) => !i.comingSoon) || r.items[0];
        if (pick) setTariffId(String(pick.id));
      })
      .catch(() => setItems([]));
  }, [type, kind, kwh]);

  const chosen = items.find((i) => i.id === tariffId);
  const live = items.filter((i) => !i.comingSoon);
  const soon = items.filter((i) => i.comingSoon);

  return (
    <PublicShell>
      <div className="mx-auto max-w-3xl px-4 py-16 md:py-24">
        <p className="text-[11px] uppercase tracking-[0.36em] text-gold">Privathaushalt</p>
        <h1 className="mt-4 font-display text-5xl leading-[0.95] md:text-6xl">Abschluss in Ruhe.</h1>
        <p className="mt-5 max-w-xl text-lg text-muted">
          Vier kurze Schritte. Ein Gesicht hinter der Marke. Unternehmen bitte über die{" "}
          <Link to="/firmen/anfrage" className="text-gold">
            Geschäftskunden-Anfrage
          </Link>
          .
        </p>

        <div className="mt-12 grid gap-8">
          <Block step="01" title="Tarif">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Sparte">
                <Select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="strom">Strom</option>
                  <option value="gas">Gas</option>
                </Select>
              </Field>
              <Field label="Jahresverbrauch kWh">
                <Input value={kwh} onChange={(e) => setKwh(e.target.value.replace(/\D/g, ""))} inputMode="numeric" />
              </Field>
            </div>
            <Field label="Lieferbarer Tarif">
              <Select value={tariffId} onChange={(e) => setTariffId(e.target.value)}>
                {live.map((t) => (
                  <option key={String(t.id)} value={String(t.id)}>
                    {String(t.provider)} · {String(t.name)}
                  </option>
                ))}
              </Select>
            </Field>
            {soon.length ? (
              <p className="text-sm leading-relaxed text-muted">
                E1 eigener Strom folgt in Kürze. Bis dahin vermitteln wir geprüfte Tarife. Derselbe Ansprechpartner.
              </p>
            ) : null}
          </Block>

          <Block step="02" title="Sie">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Vorname">
                <Input value={first} onChange={(e) => setFirst(e.target.value)} />
              </Field>
              <Field label="Nachname">
                <Input value={last} onChange={(e) => setLast(e.target.value)} />
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="E-Mail">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="Telefon">
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-[1fr_5.5rem] gap-5">
              <Field label="Straße">
                <Input value={street} onChange={(e) => setStreet(e.target.value)} />
              </Field>
              <Field label="Nr.">
                <Input value={house} onChange={(e) => setHouse(e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-[7.5rem_1fr] gap-5">
              <Field label="PLZ">
                <Input value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))} />
              </Field>
              <Field label="Ort">
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </Field>
            </div>
          </Block>

          <Block step="03" title="Bisheriger Vertrag">
            <Field label="Bisheriger Anbieter">
              <Input value={providerOld} onChange={(e) => setProviderOld(e.target.value)} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Kundennummer">
                <Input value={prevNo} onChange={(e) => setPrevNo(e.target.value)} />
              </Field>
              <Field label="Zählernummer">
                <Input value={meter} onChange={(e) => setMeter(e.target.value)} />
              </Field>
            </div>
            <label className="flex items-start gap-3 text-sm leading-relaxed text-muted">
              <input className="mt-1 accent-[#c9a227]" type="checkbox" checked={kuendigen} onChange={(e) => setKuendigen(e.target.checked)} />
              Kündigung übernehmen. Wir erstellen das Schreiben und senden es an Sie und an uns.
            </label>
          </Block>

          <Block step="04" title="Zahlung">
            <Field label="IBAN">
              <Input value={iban} onChange={(e) => setIban(e.target.value)} autoComplete="off" />
            </Field>
            <label className="flex items-start gap-3 text-sm leading-relaxed text-muted">
              <input className="mt-1 accent-[#c9a227]" type="checkbox" checked={sepa} onChange={(e) => setSepa(e.target.checked)} />
              SEPA-Lastschrift. Nur der neue Tarif, kein Extra-Kontoabzug durch E1.
            </label>
            <label className="flex items-start gap-3 text-sm leading-relaxed text-muted">
              <input className="mt-1 accent-[#c9a227]" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              Datenschutz und Kontakt durch E1 Direktvertrieb.{" "}
              <Link to="/datenschutz" className="text-gold">
                Hinweis
              </Link>
            </label>
            <Button
              className="mt-2 h-12 w-full md:w-auto md:px-10"
              disabled={busy}
              onClick={async () => {
                if (!iban.replace(/\s/g, "")) {
                  toast.error("IBAN fehlt.");
                  return;
                }
                if (!sepa) {
                  toast.error("SEPA bitte bestätigen.");
                  return;
                }
                setBusy(true);
                try {
                  await submitE1WebOrder({
                    data: {
                      tariffId,
                      firstName: first,
                      lastName: last,
                      email,
                      phone,
                      street,
                      house,
                      zip,
                      city,
                      kwh: Number(kwh),
                      consent,
                      kind,
                      previousProvider: providerOld,
                      previousCustomerNo: prevNo,
                      meter,
                      kuendigen,
                      iban,
                      sepa,
                    },
                  });
                  toast.success("Abschluss aufgenommen. Sie erhalten eine Mail.");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Buchung fehlgeschlagen");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Verbindlich abschließen
            </Button>
            {chosen && !chosen.comingSoon ? (
              <p className="text-xs text-muted">
                {String(chosen.provider)} · {String(chosen.name)}
                {Number(chosen.year) > 0 ? ` · ca. ${eur(Number(chosen.year))} im Jahr` : ""}
              </p>
            ) : null}
          </Block>
        </div>
      </div>
    </PublicShell>
  );
}
