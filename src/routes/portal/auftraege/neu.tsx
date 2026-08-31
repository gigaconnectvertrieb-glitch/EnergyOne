import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { bootstrapMe, createContract, listTariffs, quoteCommission } from "@/lib/server/api";
import { toast } from "sonner";
import { eur } from "@/lib/utils";

export const Route = createFileRoute("/portal/auftraege/neu")({ component: Capture });

function Capture() {
  const nav = useNavigate();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [house, setHouse] = useState("");
  const [zip, setZip] = useState("");
  const [city, setCity] = useState("");
  const [provider, setProvider] = useState("");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [tariffId, setTariffId] = useState("");
  const [kwh, setKwh] = useState("");
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof listTariffs>>>({ providers: [], items: [] });
  const [quote, setQuote] = useState<Awaited<ReturnType<typeof quoteCommission>> | null>(null);
  const [stufe, setStufe] = useState(1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    bootstrapMe()
      .then((m) => setStufe(m.profile.commission_stufe || 1))
      .catch(() => setStufe(1));
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      listTariffs({ data: { q, provider, type } })
        .then(setCatalog)
        .catch(() => setCatalog({ providers: [], items: [] }));
    }, 180);
    return () => window.clearTimeout(t);
  }, [q, provider, type]);

  const selected = useMemo(() => catalog.items.find((i) => i.id === tariffId) || null, [catalog.items, tariffId]);

  useEffect(() => {
    if (!tariffId || !Number(kwh)) {
      setQuote(null);
      return;
    }
    quoteCommission({ data: { tariffId, consumptionKwh: Number(kwh) } })
      .then(setQuote)
      .catch(() => setQuote(null));
  }, [tariffId, kwh]);

  async function save() {
    if (!first.trim() || !last.trim()) {
      toast.error("Name fehlt.");
      return;
    }
    if (!phone.trim()) {
      toast.error("Telefon fehlt.");
      return;
    }
    if (!street.trim() || !house.trim() || !zip.trim() || !city.trim()) {
      toast.error("Adresse unvollständig.");
      return;
    }
    if (!tariffId) {
      toast.error("Tarif wählen.");
      return;
    }
    if (!Number(kwh)) {
      toast.error("Verbrauch in kWh fehlt — für die Provision.");
      return;
    }
    setBusy(true);
    try {
      const res = await createContract({
        data: {
          firstName: first,
          lastName: last,
          phone,
          street,
          houseNumber: house,
          zip,
          city,
          tariffId,
          consumptionKwh: Number(kwh),
          inNewsales: true,
        },
      });
      toast.success(`In der Datenbank · ${eur(res.amount)}`);
      nav({ to: "/portal/auftraege/$id", params: { id: res.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl pb-16">
      <p className="text-xs uppercase tracking-[0.2em] text-gold">Schnell erfassen</p>
      <h1 className="mt-1 font-display text-4xl">Name, Adresse, Tarif</h1>
      <p className="mt-2 text-sm text-muted">
        Vertrag steht in New Sales. Hier nur die kurze Liste für die E1-Datenbank. Teamleiter
        gleicht in New Sales ab. Stufe {stufe}.
      </p>

      <div className="mt-6 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Vorname">
            <Input value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" />
          </Field>
          <Field label="Nachname">
            <Input value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" />
          </Field>
        </div>
        <Field label="Telefon">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" />
        </Field>
        <div className="grid grid-cols-[1fr_5.5rem] gap-3">
          <Field label="Straße">
            <Input value={street} onChange={(e) => setStreet(e.target.value)} autoComplete="address-line1" />
          </Field>
          <Field label="Nr.">
            <Input value={house} onChange={(e) => setHouse(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <Field label="PLZ">
            <Input value={zip} onChange={(e) => setZip(e.target.value.replace(/[^\d]/g, "").slice(0, 5))} inputMode="numeric" autoComplete="postal-code" />
          </Field>
          <Field label="Ort">
            <Input value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
          </Field>
        </div>
      </div>

      <div className="mt-4 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Anbieter">
            <Select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                setTariffId("");
              }}
            >
              <option value="">Alle</option>
              {catalog.providers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sparte">
            <Select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setTariffId("");
              }}
            >
              <option value="">Strom / Gas</option>
              <option value="strom">Strom</option>
              <option value="gas">Gas</option>
            </Select>
          </Field>
        </div>
        <Field label="Tarif suchen">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name oder Nummer" />
        </Field>
        <Field label="Tarif">
          <Select value={tariffId} onChange={(e) => setTariffId(e.target.value)}>
            <option value="">Bitte wählen</option>
            {catalog.items.map((t) => (
              <option key={t.id} value={t.id}>
                {t.provider} · {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Jahresverbrauch kWh" hint="Nur für die Provision im Portal">
          <Input inputMode="numeric" value={kwh} onChange={(e) => setKwh(e.target.value.replace(/[^\d]/g, ""))} />
        </Field>
      </div>

      <div className="mt-4 rounded-3xl bg-surface p-5 gold-hairline">
        <p className="text-xs uppercase tracking-[0.16em] text-gold">Provision</p>
        {selected ? (
          <p className="mt-2 text-sm">
            {selected.provider} · {selected.name}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted">Tarif und Verbrauch wählen.</p>
        )}
        {quote?.ok ? <p className="mt-3 font-display text-4xl text-gold">{eur(quote.amount)}</p> : null}
        {quote && !quote.ok ? <p className="mt-3 text-sm text-danger">{quote.reason}</p> : null}
        <Button className="mt-4 w-full" disabled={busy || !quote?.ok} onClick={() => void save()}>
          {busy ? "Speichert…" : "In die Datenbank"}
        </Button>
      </div>
    </div>
  );
}
