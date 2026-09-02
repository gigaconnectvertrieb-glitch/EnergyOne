import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { listPublicE1Tariffs, submitE1WebOrder } from "@/lib/server/public";
import { eur } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/buchen")({ component: Page });

function Page() {
  const [kind, setKind] = useState("privat");
  const [type, setType] = useState("strom");
  const [kwh, setKwh] = useState("3500");
  const [items, setItems] = useState<Awaited<ReturnType<typeof listPublicE1Tariffs>>["items"]>([]);
  const [ready, setReady] = useState(false);
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
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listPublicE1Tariffs({ data: { type, kind, kwh: Number(kwh) || 0 } })
      .then((r) => {
        setReady(r.ready);
        setItems(r.items);
        if (r.items[0] && !r.items.some((i) => i.id === tariffId)) setTariffId(String(r.items[0].id));
      })
      .catch(() => {
        setReady(false);
        setItems([]);
      });
  }, [type, kind, kwh]);

  const chosen = items.find((i) => i.id === tariffId);

  return (
    <PublicShell>
      <div className="mx-auto max-w-xl px-4 py-16">
        <p className="text-xs uppercase tracking-[0.28em] text-gold">E1 Strom und Gas</p>
        <h1 className="mt-2 font-display text-5xl">Direkt buchen</h1>
        {!ready ? (
          <p className="mt-6 text-muted">
            Eigene E1-Tarife sind vorbereitet. Sobald Arbeitspreis und Grundpreis im Portal stehen und der Tarif
            auf der Website freigegeben ist, können Haushalt und Firma hier abschließen. Bis dahin Beratung über das Formular.
          </p>
        ) : (
          <div className="mt-8 grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Kunde">
                <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="privat">Privathaushalt</option>
                  <option value="gewerbe">Unternehmen</option>
                </Select>
              </Field>
              <Field label="Sparte">
                <Select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="strom">Strom</option>
                  <option value="gas">Gas</option>
                </Select>
              </Field>
            </div>
            <Field label="Jahresverbrauch kWh">
              <Input value={kwh} onChange={(e) => setKwh(e.target.value.replace(/\D/g, ""))} inputMode="numeric" />
            </Field>
            <Field label="Tarif">
              <Select value={tariffId} onChange={(e) => setTariffId(e.target.value)}>
                {items.map((t) => (
                  <option key={String(t.id)} value={String(t.id)}>
                    {String(t.name)}
                  </option>
                ))}
              </Select>
            </Field>
            {chosen ? (
              <p className="text-sm text-muted">
                {String(chosen.arbeit_ct).replace(".", ",")} ct/kWh · Grundpreis {eur(Number(chosen.grund_year))} / Jahr
                {Number(chosen.year) > 0 ? ` · ca. ${eur(Number(chosen.year))} / Jahr` : ""}
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Vorname">
                <Input value={first} onChange={(e) => setFirst(e.target.value)} />
              </Field>
              <Field label="Nachname">
                <Input value={last} onChange={(e) => setLast(e.target.value)} />
              </Field>
            </div>
            <Field label="E-Mail">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Telefon">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <div className="grid grid-cols-[1fr_5rem] gap-3">
              <Field label="Straße">
                <Input value={street} onChange={(e) => setStreet(e.target.value)} />
              </Field>
              <Field label="Nr.">
                <Input value={house} onChange={(e) => setHouse(e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-[7rem_1fr] gap-3">
              <Field label="PLZ">
                <Input value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))} />
              </Field>
              <Field label="Ort">
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </Field>
            </div>
            <Field label="Bisheriger Anbieter">
              <Input value={providerOld} onChange={(e) => setProviderOld(e.target.value)} placeholder="Steht auf der Rechnung" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Kundennummer alt">
                <Input value={prevNo} onChange={(e) => setPrevNo(e.target.value)} />
              </Field>
              <Field label="Zählernummer">
                <Input value={meter} onChange={(e) => setMeter(e.target.value)} />
              </Field>
            </div>
            <label className="flex gap-2 text-sm text-muted">
              <input type="checkbox" checked={kuendigen} onChange={(e) => setKuendigen(e.target.checked)} />
              Kündigung beim bisherigen Anbieter vorbereiten
            </label>
            <label className="flex gap-2 text-sm text-muted">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              Datenschutz und Kontaktaufnahme
            </label>
            <Button
              disabled={busy}
              onClick={async () => {
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
                    },
                  });
                  toast.success("Buchung aufgenommen. Mail kommt an info@-Absender.");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Buchung fehlgeschlagen");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Jetzt buchen
            </Button>
          </div>
        )}
      </div>
    </PublicShell>
  );
}
