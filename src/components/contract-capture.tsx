/**
 * E1 Erfassung – Hauptweg
 * -----------------------
 * Auftrag vollständig bei E1 erfassen (Kunde, Tarif, Bank, Unterschrift).
 * Danach: parken oder an New Sales übergeben.
 * Offline-fähig, mobil + Desktop, gleiche Maske im Portal.
 *
 * Ersetzt: src/components/contract-capture.tsx
 */

import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, CheckboxRow } from "@/components/ui/field";
import { SignaturePad } from "@/components/signature-pad";
import {
  bootstrapMe,
  compareTariffs,
  createContract,
  listBookableStaff,
  listTariffs,
  quoteCommission,
} from "@/lib/server/api";
import { toast } from "sonner";
import { NettoBrutto } from "@/components/netto-brutto";
import { vatOn } from "@/lib/steuer";
import { eur } from "@/lib/utils";
import { deBankFromIban } from "@/lib/iban";
import { cacheTariffs, isOffline, queueContract, readCachedTariffs } from "@/lib/offline-queue";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";

export type CapturePre = {
  street?: string;
  house?: string;
  zip?: string;
  city?: string;
  first?: string;
  last?: string;
  phone?: string;
  email?: string;
};

const DRAFT = "e1_auftrag_entwurf";
const STEPS = ["Kunde", "Lieferstelle", "Tarif", "Bank", "Abschluss"] as const;

export function ContractCapture({
  afterTo,
  pre,
}: {
  afterTo?: "portal" | "app";
  pre?: CapturePre;
}) {
  const nav = useNavigate();
  const start = pre || {};
  const [step, setStep] = useState(0);

  // Kunde
  const [first, setFirst] = useState(start.first || "");
  const [last, setLast] = useState(start.last || "");
  const [salutation, setSalutation] = useState("Herr");
  const [birth, setBirth] = useState("");
  const [landline, setLandline] = useState("");
  const [mobile, setMobile] = useState(start.phone || "");
  const [email, setEmail] = useState(start.email || "");

  // Lieferstelle
  const [street, setStreet] = useState(start.street || "");
  const [house, setHouse] = useState(start.house || "");
  const [zip, setZip] = useState(start.zip || "");
  const [city, setCity] = useState(start.city || "");
  const [meter, setMeter] = useState("");
  const [providerOld, setProviderOld] = useState("");
  const [deliveryKind, setDeliveryKind] = useState<"wechsel" | "neueinzug">("wechsel");
  const [startDate, setStartDate] = useState("");
  const [kwh, setKwh] = useState("");
  const [melo, setMelo] = useState("");
  const [malo, setMalo] = useState("");
  const [grid, setGrid] = useState("");
  const [prevNo, setPrevNo] = useState("");
  const [oldEnd, setOldEnd] = useState("");

  // Tarif
  const [type, setType] = useState("strom");
  const [provider, setProvider] = useState("");
  const [q, setQ] = useState("");
  const [tariffId, setTariffId] = useState("");
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof listTariffs>>>({
    providers: [],
    items: [],
  });
  const [quote, setQuote] = useState<Awaited<ReturnType<typeof quoteCommission>> | null>(null);
  const [compare, setCompare] = useState<Awaited<ReturnType<typeof compareTariffs>> | null>(null);
  const [comparing, setComparing] = useState(false);
  const [oldArbeit, setOldArbeit] = useState("");
  const [oldGrund, setOldGrund] = useState("");

  // Bank
  const [iban, setIban] = useState("");
  const [bankOwner, setBankOwner] = useState("");
  const [bic, setBic] = useState("");
  const [bankName, setBankName] = useState("");
  const [sepa, setSepa] = useState(false);

  // Abschluss
  const [privacy, setPrivacy] = useState(false);
  const [sign, setSign] = useState("");
  const [digitalSign, setDigitalSign] = useState(false);
  const [signedAt, setSignedAt] = useState(new Date().toISOString().slice(0, 10));
  const [early, setEarly] = useState(false);
  const [postInvoice, setPostInvoice] = useState(false);
  const [scan, setScan] = useState<{ name: string; base64: string } | null>(null);
  const [lockOn, setLockOn] = useState(true);
  const [lockPw, setLockPw] = useState("");

  // Meta
  const [stufe, setStufe] = useState(1);
  const [busy, setBusy] = useState(false);
  const [staff, setStaff] = useState<Awaited<ReturnType<typeof listBookableStaff>>>([]);
  const [forStaff, setForStaff] = useState("");

  // Draft laden
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT);
      if (!raw) return;
      const d = JSON.parse(raw) as Record<string, string>;
      if (d.first) setFirst(d.first);
      if (d.last) setLast(d.last);
      if (d.salutation) setSalutation(d.salutation);
      if (d.birth) setBirth(d.birth);
      if (d.landline) setLandline(d.landline);
      if (d.mobile) setMobile(d.mobile);
      if (d.email) setEmail(d.email);
      if (!start.street && d.street) setStreet(d.street);
      if (!start.house && d.house) setHouse(d.house);
      if (!start.zip && d.zip) setZip(d.zip);
      if (!start.city && d.city) setCity(d.city);
      if (d.providerOld) setProviderOld(d.providerOld);
      if (d.kwh) setKwh(d.kwh);
      if (d.tariffId) setTariffId(d.tariffId);
      if (d.iban) setIban(d.iban);
      if (d.bankOwner) setBankOwner(d.bankOwner);
      if (d.meter) setMeter(d.meter);
    } catch {
      /* */
    }
  }, []);

  // Draft speichern
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(
          DRAFT,
          JSON.stringify({
            first, last, salutation, birth, landline, mobile, email,
            street, house, zip, city, providerOld, kwh, tariffId, iban, bankOwner, meter,
          }),
        );
      } catch {
        /* */
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [first, last, salutation, birth, landline, mobile, email, street, house, zip, city, providerOld, kwh, tariffId, iban, bankOwner, meter]);

  useEffect(() => {
    bootstrapMe()
      .then((m) => {
        setStufe(m.profile.commission_stufe || 1);
        setForStaff(m.profile.user_id);
      })
      .catch(() => setStufe(1));
    listBookableStaff()
      .then(setStaff)
      .catch(() => setStaff([]));
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      listTariffs({ data: { q, provider, type } })
        .then((rows) => {
          setCatalog(rows);
          void cacheTariffs(rows);
        })
        .catch(async () => {
          const cached = await readCachedTariffs<Awaited<ReturnType<typeof listTariffs>>>();
          if (cached) setCatalog(cached);
          else setCatalog({ providers: [], items: [] });
        });
    }, 180);
    return () => window.clearTimeout(t);
  }, [q, provider, type]);

  const selected = useMemo(
    () => catalog.items.find((i) => i.id === tariffId) || null,
    [catalog.items, tariffId],
  );

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

  // IBAN → Bankdaten
  useEffect(() => {
    const cleaned = iban.replace(/\s+/g, "");
    if (cleaned.length < 15) return;
    try {
      const info = deBankFromIban(cleaned);
      if (info?.bic) setBic(info.bic);
      if (info?.name) setBankName(info.name);
    } catch {
      /* */
    }
  }, [iban]);

  function validateStep(s: number): string | null {
    if (s === 0) {
      if (!first.trim() || !last.trim()) return "Name fehlt.";
      if (!mobile.trim() && !landline.trim()) return "Telefon oder Mobilnummer angeben.";
    }
    if (s === 1) {
      if (!street.trim() || !house.trim() || !zip.trim() || !city.trim()) return "Adresse unvollständig.";
      if (!Number(kwh)) return "Jahresverbrauch in kWh fehlt.";
    }
    if (s === 2) {
      if (!tariffId) return "Tarif wählen.";
    }
    if (s === 3) {
      if (iban.trim() && !sepa) return "SEPA bestätigen, wenn IBAN angegeben ist.";
    }
    return null;
  }

  function next() {
    const err = validateStep(step);
    if (err) {
      toast.error(err);
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function save(mode: "park" | "newsales") {
    for (let s = 0; s <= 2; s++) {
      const err = validateStep(s);
      if (err) {
        toast.error(err);
        setStep(s);
        return;
      }
    }
    if (iban.trim() && !sepa) {
      toast.error("SEPA bestätigen.");
      setStep(3);
      return;
    }

    setBusy(true);
    const payload = {
      firstName: first,
      lastName: last,
      salutation,
      birthDate: birth || undefined,
      phone: mobile || landline,
      landline: landline || undefined,
      mobile: mobile || undefined,
      email: email || undefined,
      street,
      houseNumber: house,
      zip,
      city,
      tariffId,
      consumptionKwh: Number(kwh),
      meterNumber: meter || undefined,
      previousProvider: providerOld || undefined,
      startDate: startDate || undefined,
      forStaffId: forStaff || undefined,
      // Hauptweg: bei E1 erfasst, für New Sales bestimmt
      inNewsales: mode === "newsales",
      fullFlow: true,
      parked: mode === "park",
      source: mode === "newsales" ? "e1_to_newsales" : "e1_parked",
      lockPassword: lockOn && lockPw.length >= 6 ? lockPw : undefined,
      iban: iban || undefined,
      bankOwner: bankOwner || undefined,
      bic: bic || undefined,
      bankName: bankName || undefined,
      deliveryKind,
      meloId: melo || undefined,
      maloId: malo || undefined,
      gridOperator: grid || undefined,
      previousCustomerNo: prevNo || undefined,
      oldContractEnd: oldEnd || undefined,
      signedAt: signedAt || undefined,
      digitalSignWanted: digitalSign,
      earlyDelivery: early,
      invoiceByPost: postInvoice,
      sepaConfirmed: sepa,
      privacyConfirmed: privacy || undefined,
      signatureData: sign || undefined,
      scanBase64: scan?.base64,
      scanName: scan?.name,
    };

    try {
      if (isOffline()) {
        await queueContract(payload);
        try {
          localStorage.removeItem(DRAFT);
        } catch {
          /* */
        }
        toast.success("Offline gespeichert. Wird gesendet, sobald Netz da ist.");
        goBack();
        return;
      }
      const res = await createContract({ data: payload });
      try {
        localStorage.removeItem(DRAFT);
      } catch {
        /* */
      }
      if (mode === "park") {
        toast.success(
          res.margin
            ? `Geparkt · Berater ${eur(res.advisor)} netto`
            : `Geparkt · ${eur(res.amount)} netto`,
        );
      } else {
        toast.success(
          res.margin
            ? `An New Sales · Berater ${eur(res.advisor)} netto`
            : `Auftrag erfasst · ${eur(res.amount)} netto`,
        );
      }
      if (afterTo === "app") nav({ to: "/app" });
      else nav({ to: "/portal/auftraege/$id", params: { id: res.id } });
    } catch (e) {
      try {
        await queueContract(payload);
        toast.success("Kein Netz. Auftrag liegt auf dem Gerät und wird nachgeschickt.");
        goBack();
      } catch {
        toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
      }
    } finally {
      setBusy(false);
    }
  }

  function goBack() {
    if (afterTo === "app") nav({ to: "/app" });
    else nav({ to: "/portal" });
  }

  return (
    <div className="mx-auto max-w-xl pb-24">
      <p className="text-[11px] uppercase tracking-[0.22em] text-gold">Erfassung</p>
      <h1 className="mt-1 font-display text-3xl sm:text-4xl">Neuer Auftrag</h1>
      {(street || house) && (
        <p className="mt-2 text-sm text-muted">
          {street} {house}
          {zip || city ? ` · ${zip} ${city}` : ""}
        </p>
      )}

      {/* Steps */}
      <div className="mt-5 flex gap-1 overflow-x-auto pb-1">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              if (i < step) setStep(i);
              else if (i === step + 1) next();
            }}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.1em] transition-colors ${
              i === step
                ? "bg-gold text-bg"
                : i < step
                  ? "bg-elevated text-gold"
                  : "text-muted"
            }`}
          >
            {i < step ? <Check className="mr-1 inline size-3" /> : null}
            {i + 1} {label}
          </button>
        ))}
      </div>

      {/* Schritt 0: Kunde */}
      {step === 0 && (
        <section className="mt-6 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline">
          <p className="text-xs uppercase tracking-[0.16em] text-gold">Kunde</p>
          {staff.length > 1 && (
            <Field label="Buchen auf Mitarbeiter">
              <Select value={forStaff} onChange={(e) => setForStaff(e.target.value)}>
                {staff.map((s) => (
                  <option key={s.user_id} value={s.user_id}>
                    {s.staff_id ? `${s.staff_id} · ${s.name}` : s.name} · Stufe{" "}
                    {s.commission_stufe || 1}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Anrede">
            <Select value={salutation} onChange={(e) => setSalutation(e.target.value)}>
              <option>Herr</option>
              <option>Frau</option>
              <option>Divers</option>
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Vorname *">
              <Input
                value={first}
                onChange={(e) => setFirst(e.target.value)}
                autoComplete="given-name"
              />
            </Field>
            <Field label="Nachname *">
              <Input
                value={last}
                onChange={(e) => setLast(e.target.value)}
                autoComplete="family-name"
              />
            </Field>
          </div>
          <Field label="Geburtsdatum">
            <Input
              type="date"
              value={birth}
              onChange={(e) => setBirth(e.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Mobil *">
              <Input
                type="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                autoComplete="tel"
              />
            </Field>
            <Field label="Festnetz">
              <Input
                type="tel"
                value={landline}
                onChange={(e) => setLandline(e.target.value)}
              />
            </Field>
          </div>
          <Field label="E-Mail">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </Field>
        </section>
      )}

      {/* Schritt 1: Lieferstelle */}
      {step === 1 && (
        <section className="mt-6 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline">
          <p className="text-xs uppercase tracking-[0.16em] text-gold">Lieferstelle</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_5rem]">
            <Field label="Straße *">
              <Input value={street} onChange={(e) => setStreet(e.target.value)} />
            </Field>
            <Field label="Nr. *">
              <Input value={house} onChange={(e) => setHouse(e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-[7rem_1fr]">
            <Field label="PLZ *">
              <Input value={zip} onChange={(e) => setZip(e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="Ort *">
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </Field>
          </div>
          <Field label="Jahresverbrauch kWh *">
            <Input
              value={kwh}
              onChange={(e) => setKwh(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              placeholder="z. B. 3500"
            />
          </Field>
          <Field label="Zählernummer">
            <Input value={meter} onChange={(e) => setMeter(e.target.value)} />
          </Field>
          <Field label="Art">
            <Select
              value={deliveryKind}
              onChange={(e) => setDeliveryKind(e.target.value as "wechsel" | "neueinzug")}
            >
              <option value="wechsel">Anbieterwechsel</option>
              <option value="neueinzug">Neueinzug</option>
            </Select>
          </Field>
          <Field label="Bisheriger Anbieter">
            <Input
              value={providerOld}
              onChange={(e) => setProviderOld(e.target.value)}
              placeholder="optional"
            />
          </Field>
          <Field label="Gewünschter Lieferbeginn">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">Weitere Felder (MaLo, MeLo, Netz…)</summary>
            <div className="mt-3 grid gap-3">
              <Field label="Marktlokation (MaLo)">
                <Input value={malo} onChange={(e) => setMalo(e.target.value)} />
              </Field>
              <Field label="Messlokation (MeLo)">
                <Input value={melo} onChange={(e) => setMelo(e.target.value)} />
              </Field>
              <Field label="Netzbetreiber">
                <Input value={grid} onChange={(e) => setGrid(e.target.value)} />
              </Field>
              <Field label="Alte Kundennummer">
                <Input value={prevNo} onChange={(e) => setPrevNo(e.target.value)} />
              </Field>
              <Field label="Ende alter Vertrag">
                <Input type="date" value={oldEnd} onChange={(e) => setOldEnd(e.target.value)} />
              </Field>
            </div>
          </details>
        </section>
      )}

      {/* Schritt 2: Tarif */}
      {step === 2 && (
        <section className="mt-6 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline">
          <p className="text-xs uppercase tracking-[0.16em] text-gold">Tarif</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Sparte">
              <Select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="strom">Strom</option>
                <option value="gas">Gas</option>
              </Select>
            </Field>
            <Field label="Anbieter filtern">
              <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="">Alle</option>
                {catalog.providers.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Suche">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tarifname…"
            />
          </Field>
          <Field label="Tarif wählen *">
            <Select value={tariffId} onChange={(e) => setTariffId(e.target.value)}>
              <option value="">— bitte wählen —</option>
              {catalog.items.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.provider} · {t.name}
                  {t.work_price != null ? ` · ${t.work_price} ct` : ""}
                </option>
              ))}
            </Select>
          </Field>
          {selected && (
            <div className="rounded-2xl bg-elevated p-3 text-sm">
              <p className="font-medium">
                {selected.provider} · {selected.name}
              </p>
              {quote?.ok && (
                <p className="mt-1 text-muted">
                  Provision ca.{" "}
                  <NettoBrutto net={quote.amount} />
                </p>
              )}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Alter Arbeitspreis (ct)">
              <Input value={oldArbeit} onChange={(e) => setOldArbeit(e.target.value)} />
            </Field>
            <Field label="Alter Grundpreis (€)">
              <Input value={oldGrund} onChange={(e) => setOldGrund(e.target.value)} />
            </Field>
          </div>
          {Number(kwh) > 0 && (oldArbeit || oldGrund) && tariffId && (
            <Button
              type="button"
              variant="outline"
              disabled={comparing}
              onClick={async () => {
                setComparing(true);
                try {
                  const r = await compareTariffs({
                    data: {
                      tariffId,
                      consumptionKwh: Number(kwh),
                      oldWorkPrice: oldArbeit ? Number(oldArbeit) : undefined,
                      oldBasePrice: oldGrund ? Number(oldGrund) : undefined,
                    },
                  });
                  setCompare(r);
                } catch {
                  setCompare(null);
                } finally {
                  setComparing(false);
                }
              }}
            >
              {comparing ? "Rechnet…" : "Ersparnis vergleichen"}
            </Button>
          )}
          {compare && (
            <p className="text-sm text-muted">
              Vergleichsergebnis hinterlegt
              {"savings" in compare && compare.savings != null
                ? ` · ca. ${eur(Number(compare.savings))} / Jahr`
                : ""}
            </p>
          )}
        </section>
      )}

      {/* Schritt 3: Bank */}
      {step === 3 && (
        <section className="mt-6 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline">
          <p className="text-xs uppercase tracking-[0.16em] text-gold">Bank & SEPA</p>
          <Field label="IBAN">
            <Input
              value={iban}
              onChange={(e) => setIban(e.target.value.toUpperCase())}
              placeholder="DE…"
              autoComplete="off"
            />
          </Field>
          <Field label="Kontoinhaber">
            <Input
              value={bankOwner}
              onChange={(e) => setBankOwner(e.target.value)}
              placeholder={`${first} ${last}`.trim()}
            />
          </Field>
          {(bic || bankName) && (
            <p className="text-xs text-muted">
              {bankName}
              {bic ? ` · BIC ${bic}` : ""}
            </p>
          )}
          <CheckboxRow checked={sepa} onChange={setSepa}>
            SEPA-Lastschriftmandat erteilt
          </CheckboxRow>
          <p className="text-xs text-muted">
            IBAN kann leer bleiben und später nachgetragen werden – dann ohne SEPA.
          </p>
        </section>
      )}

      {/* Schritt 4: Abschluss */}
      {step === 4 && (
        <section className="mt-6 grid gap-4">
          <div className="rounded-3xl bg-surface p-5 gold-hairline">
            <p className="text-xs uppercase tracking-[0.16em] text-gold">Zusammenfassung</p>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Kunde</dt>
                <dd className="text-right font-medium">
                  {salutation} {first} {last}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Adresse</dt>
                <dd className="text-right">
                  {street} {house}, {zip} {city}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Verbrauch</dt>
                <dd className="text-right tabular-nums">{kwh} kWh</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Tarif</dt>
                <dd className="text-right">
                  {selected ? `${selected.provider} · ${selected.name}` : "—"}
                </dd>
              </div>
              {quote?.ok && (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Provision</dt>
                  <dd className="text-right">
                    {eur(quote.amount)} netto
                    <span className="block text-[10px] text-muted">
                      brutto {eur(vatOn(quote.amount).gross)}
                    </span>
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="grid gap-3 rounded-3xl bg-surface p-5 gold-hairline">
            <p className="text-xs uppercase tracking-[0.16em] text-gold">Unterschrift & Optionen</p>
            <Field label="Unterschriftsdatum">
              <Input
                type="date"
                value={signedAt}
                onChange={(e) => setSignedAt(e.target.value)}
              />
            </Field>
            <CheckboxRow checked={privacy} onChange={setPrivacy}>
              Datenschutz / AGB zur Kenntnis genommen
            </CheckboxRow>
            <CheckboxRow checked={digitalSign} onChange={setDigitalSign}>
              Digitale Unterschrift per E-Mail (DocuSign) anfordern
            </CheckboxRow>
            <CheckboxRow checked={early} onChange={setEarly}>
              Lieferung vor Ablauf der Widerrufsfrist möglich
            </CheckboxRow>
            <CheckboxRow checked={postInvoice} onChange={setPostInvoice}>
              Rechnung per Post
            </CheckboxRow>
            <p className="text-sm text-muted">Unterschrift vor Ort (Tablet)</p>
            <SignaturePad value={sign} onChange={setSign} />
            <Field label="Scan / Foto (optional)">
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
                  reader.onload = () =>
                    setScan({ name: f.name, base64: String(reader.result || "") });
                  reader.readAsDataURL(f);
                }}
              />
              {scan ? <p className="mt-1 text-xs text-muted">{scan.name}</p> : null}
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={lockOn}
                onChange={(e) => setLockOn(e.target.checked)}
              />
              Kundendaten passwortgeschützt speichern
            </label>
            {lockOn && (
              <Field label="Passwort (min. 6 Zeichen)">
                <Input
                  type="password"
                  value={lockPw}
                  onChange={(e) => setLockPw(e.target.value)}
                />
              </Field>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() => void save("park")}
            >
              {busy ? "Speichert…" : "Nur parken"}
            </Button>
            <Button
              className="w-full"
              disabled={busy}
              onClick={() => void save("newsales")}
            >
              {busy ? "Speichert…" : "Erfassen → New Sales"}
            </Button>
          </div>
          <p className="text-center text-xs text-muted">
            „Erfassen → New Sales“ speichert den Auftrag bei E1 und markiert ihn zur
            Übergabe an New Sales.
          </p>
        </section>
      )}

      {/* Navigation unten */}
      {step < 4 && (
        <div className="mt-6 flex gap-2">
          {step > 0 ? (
            <Button type="button" variant="outline" className="flex-1" onClick={back}>
              <ChevronLeft className="mr-1 size-4" />
              Zurück
            </Button>
          ) : (
            <Button type="button" variant="outline" className="flex-1" onClick={goBack}>
              Abbrechen
            </Button>
          )}
          <Button type="button" className="flex-1" onClick={next}>
            Weiter
            <ChevronRight className="ml-1 size-4" />
          </Button>
        </div>
      )}
      {step === 4 && (
        <div className="mt-4">
          <Button type="button" variant="outline" className="w-full" onClick={back}>
            <ChevronLeft className="mr-1 size-4" />
            Zurück
          </Button>
        </div>
      )}
    </div>
  );
}
