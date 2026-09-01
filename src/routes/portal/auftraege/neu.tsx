import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, CheckboxRow } from "@/components/ui/field";
import { SignaturePad } from "@/components/signature-pad";
import { bootstrapMe, createContract, listBookableStaff, listTariffs, quoteCommission } from "@/lib/server/api";
import { toast } from "sonner";
import { NettoBrutto } from "@/components/netto-brutto";
import { vatOn } from "@/lib/steuer";
import { eur } from "@/lib/utils";

export const Route = createFileRoute("/portal/auftraege/neu")({
  validateSearch: (raw: Record<string, unknown>) => {
    const s = (k: string) => (typeof raw[k] === "string" && raw[k] ? String(raw[k]) : undefined);
    return {
      street: s("street"),
      house: s("house"),
      zip: s("zip"),
      city: s("city"),
    } as { street?: string; house?: string; zip?: string; city?: string };
  },
  component: Capture,
});

function Capture() {
  const nav = useNavigate();
  const pre = Route.useSearch();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState(pre.street || "");
  const [house, setHouse] = useState(pre.house || "");
  const [zip, setZip] = useState(pre.zip || "");
  const [city, setCity] = useState(pre.city || "");
  const [provider, setProvider] = useState("");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [tariffId, setTariffId] = useState("");
  const [kwh, setKwh] = useState("");
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof listTariffs>>>({ providers: [], items: [] });
  const [quote, setQuote] = useState<Awaited<ReturnType<typeof quoteCommission>> | null>(null);
  const [stufe, setStufe] = useState(1);
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [staff, setStaff] = useState<Awaited<ReturnType<typeof listBookableStaff>>>([]);
  const [forStaff, setForStaff] = useState("");
  const [full, setFull] = useState(false);
  const [canFull, setCanFull] = useState(false);
  const [iban, setIban] = useState("");
  const [bankOwner, setBankOwner] = useState("");
  const [sepa, setSepa] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [sign, setSign] = useState("");
  const [email, setEmail] = useState("");
  const [scan, setScan] = useState<{ name: string; base64: string } | null>(null);

  useEffect(() => {
    bootstrapMe()
      .then((m) => {
        setStufe(m.profile.commission_stufe || 1);
        setRole(m.profile.role);
        setForStaff(m.profile.user_id);
        setCanFull(Boolean(m.flags.full_contract || m.flags.phase2_own_tariffs));
      })
      .catch(() => setStufe(1));
    listBookableStaff()
      .then(setStaff)
      .catch(() => setStaff([]));
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
  const ownTariff = Boolean(selected && selected.provider === "E1");
  useEffect(() => {
    setFull(canFull && ownTariff);
  }, [canFull, ownTariff]);

  useEffect(() => {
    if (!tariffId || !Number(kwh)) {
      setQuote(null);
      return;
    }
    const staffStufe = staff.find((s) => s.user_id === forStaff)?.commission_stufe ?? stufe;
    quoteCommission({ data: { tariffId, consumptionKwh: Number(kwh), stufe: staffStufe } })
      .then(setQuote)
      .catch(() => setQuote(null));
  }, [tariffId, kwh, forStaff, staff, stufe]);

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
    if (full && !privacy) {
      toast.error("Datenschutz muss bestätigt sein.");
      return;
    }
    if (full && iban.trim() && !sepa) {
      toast.error("SEPA muss bestätigt sein, wenn eine IBAN angegeben ist.");
      return;
    }
    setBusy(true);
    try {
      const res = await createContract({
        data: {
          firstName: first,
          lastName: last,
          phone,
          email: email || undefined,
          street,
          houseNumber: house,
          zip,
          city,
          tariffId,
          consumptionKwh: Number(kwh),
          forStaffId: forStaff || undefined,
          inNewsales: !full,
          fullFlow: full,
          iban: iban || undefined,
          bankOwner: bankOwner || undefined,
          sepaConfirmed: sepa,
          privacyConfirmed: full ? privacy : undefined,
          signatureData: full ? sign : undefined,
          scanBase64: scan?.base64,
          scanName: scan?.name,
        },
      });
      toast.success(
        res.margin
          ? `Gespeichert · Berater ${eur(res.advisor)} netto / ${eur(vatOn(res.advisor).gross)} brutto · Agentur ${eur(res.agency)} · Marge ${eur(res.margin)}${res.ibanMissing ? " · ohne IBAN" : ""}`
          : `Gespeichert · ${eur(res.amount)} netto / ${eur(vatOn(res.amount).gross)} brutto${res.ibanMissing ? " · ohne IBAN" : ""}`,
      );
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
        Name, Adresse, Tarif, Telefon. IBAN und Vertragsscan sind optional — ohne IBAN geht der Auftrag trotzdem raus.
        Stufe {stufe}.
      </p>

      {staff.length > 1 ? (
        <div className="mt-6 rounded-3xl bg-surface p-5 gold-hairline">
          <Field label="Buchen auf Mitarbeiter-ID">
            <Select value={forStaff} onChange={(e) => setForStaff(e.target.value)}>
              {staff.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.staff_id ? `${s.staff_id} · ${s.name}` : s.name} · Stufe {s.commission_stufe || 1}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      ) : null}

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
        <Field label="E-Mail (optional)">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />
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
        {quote?.ok ? (
          <>
            <div className="mt-3">
              <NettoBrutto net={quote.advisor} />
            </div>
            <p className="text-sm text-muted">Berater Stufe {quote.stufe} · Liste netto, zzgl. 19% USt</p>
            {quote.margin > 0 && (role === "super_admin" || role === "buchhaltung" || role === "gebietsleiter") ? (
              <>
                <p className="mt-2 text-sm">
                  Agentur NS 13 {eur(quote.agency)} netto / {eur(vatOn(quote.agency).gross)} brutto
                </p>
                <p className="text-sm text-gold">
                  E1-Marge {eur(quote.margin)} netto / {eur(vatOn(quote.margin).gross)} brutto
                </p>
              </>
            ) : null}
          </>
        ) : null}
        {quote && !quote.ok ? <p className="mt-3 text-sm text-danger">{quote.reason}</p> : null}
      </div>

      <div className="mt-4 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline">
        <p className="text-xs uppercase tracking-[0.16em] text-gold">Bank & Vertrag — optional</p>
        <p className="text-sm text-muted">Ohne IBAN speichern und abschicken. Später nachtragen oder Scan hochladen.</p>
        <Field label="IBAN">
          <Input value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())} autoComplete="off" placeholder="leer lassen geht" />
        </Field>
        <Field label="Kontoinhaber">
          <Input value={bankOwner} onChange={(e) => setBankOwner(e.target.value)} />
        </Field>
        {iban.trim() ? (
          <CheckboxRow checked={sepa} onChange={setSepa}>
            SEPA-Lastschriftmandat erteilt
          </CheckboxRow>
        ) : null}
        <Field label="Vertrag / Rechnung / Scan">
          <input
            type="file"
            accept="image/*,.pdf,application/pdf"
            className="mt-1 block w-full text-sm"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) {
                setScan(null);
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                const base64 = String(reader.result || "");
                setScan({ name: f.name, base64 });
              };
              reader.readAsDataURL(f);
            }}
          />
          {scan ? <p className="mt-1 text-xs text-muted">{scan.name}</p> : null}
        </Field>
      </div>

      {full ? (
        <div className="mt-4 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline">
          <p className="text-xs uppercase tracking-[0.16em] text-gold">Eigener E1-Strom · AGB</p>
          <CheckboxRow checked={privacy} onChange={setPrivacy}>
            Datenschutz / AGB akzeptiert
          </CheckboxRow>
          <p className="text-sm text-muted">Unterschrift am Tablet (optional)</p>
          <SignaturePad value={sign} onChange={setSign} />
        </div>
      ) : null}

      <div className="mt-4 rounded-3xl bg-surface p-5 gold-hairline">
        <Button className="w-full" disabled={busy || !quote?.ok} onClick={() => void save()}>
          {busy ? "Speichert…" : "Abschicken"}
        </Button>
      </div>
    </div>
  );
}
