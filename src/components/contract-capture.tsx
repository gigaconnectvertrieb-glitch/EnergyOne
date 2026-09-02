import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, CheckboxRow } from "@/components/ui/field";
import { SignaturePad } from "@/components/signature-pad";
import { bootstrapMe, compareTariffs, createContract, listBookableStaff, listTariffs, quoteCommission } from "@/lib/server/api";
import { toast } from "sonner";
import { NettoBrutto } from "@/components/netto-brutto";
import { vatOn } from "@/lib/steuer";
import { eur } from "@/lib/utils";
import { deBankFromIban } from "@/lib/iban";

export type CapturePre = { street?: string; house?: string; zip?: string; city?: string };

export function ContractCapture({
  afterTo,
  pre,
}: {
  afterTo?: "portal" | "app";
  pre?: CapturePre;
}) {
  const nav = useNavigate();
  const start = pre || {};
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [salutation, setSalutation] = useState("Herr");
  const [birth, setBirth] = useState("");
  const [landline, setLandline] = useState("");
  const [mobile, setMobile] = useState("");
  const [street, setStreet] = useState(start.street || "");
  const [house, setHouse] = useState(start.house || "");
  const [zip, setZip] = useState(start.zip || "");
  const [city, setCity] = useState(start.city || "");
  const [provider, setProvider] = useState("");
  const [type, setType] = useState("strom");
  const [q, setQ] = useState("");
  const [tariffId, setTariffId] = useState("");
  const [kwh, setKwh] = useState("");
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof listTariffs>>>({ providers: [], items: [] });
  const [quote, setQuote] = useState<Awaited<ReturnType<typeof quoteCommission>> | null>(null);
  const [compare, setCompare] = useState<Awaited<ReturnType<typeof compareTariffs>> | null>(null);
  const [comparing, setComparing] = useState(false);
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
  const [meter, setMeter] = useState("");
  const [providerOld, setProviderOld] = useState("");
  const [oldArbeit, setOldArbeit] = useState("");
  const [oldGrund, setOldGrund] = useState("");
  const [deliveryKind, setDeliveryKind] = useState<"wechsel" | "neueinzug">("wechsel");
  const [startDate, setStartDate] = useState("");
  const [signedAt, setSignedAt] = useState(new Date().toISOString().slice(0, 10));
  const [oldEnd, setOldEnd] = useState("");
  const [prevNo, setPrevNo] = useState("");
  const [melo, setMelo] = useState("");
  const [malo, setMalo] = useState("");
  const [grid, setGrid] = useState("");
  const [bic, setBic] = useState("");
  const [blz, setBlz] = useState("");
  const [account, setAccount] = useState("");
  const [bankName, setBankName] = useState("");
  const [early, setEarly] = useState(false);
  const [postInvoice, setPostInvoice] = useState(false);
  const [digitalSign, setDigitalSign] = useState(false);

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

  async function save(parked: boolean) {
    if (!first.trim() || !last.trim()) {
      toast.error("Name fehlt.");
      return;
    }
    if (!mobile.trim() && !landline.trim()) {
      toast.error("Telefon oder Mobilnummer angeben.");
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
          inNewsales: !full,
          fullFlow: full,
          parked,
          iban: iban || undefined,
          bankOwner: bankOwner || undefined,
          bic: bic || undefined,
          bankName: bankName || undefined,
          blz: blz || undefined,
          accountNo: account || undefined,
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
          privacyConfirmed: full ? privacy : undefined,
          signatureData: full ? sign : undefined,
          scanBase64: scan?.base64,
          scanName: scan?.name,
        },
      });
      toast.success(
        parked
          ? res.margin
            ? `Geparkt · Berater ${eur(res.advisor)} netto / ${eur(vatOn(res.advisor).gross)} brutto`
            : `Geparkt · ${eur(res.amount)} netto / ${eur(vatOn(res.amount).gross)} brutto`
          : res.margin
            ? `Gebucht · Berater ${eur(res.advisor)} netto / ${eur(vatOn(res.advisor).gross)} brutto`
            : `Gebucht · ${eur(res.amount)} netto / ${eur(vatOn(res.amount).gross)} brutto`,
      );
      if (afterTo === "app") nav({ to: "/app/bilanz" });
      else nav({ to: "/portal/auftraege/$id", params: { id: res.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl pb-16">
      <p className="text-xs uppercase tracking-[0.2em] text-gold">Feld · Aufnahme</p>
      <h1 className="mt-1 font-display text-4xl">Auftrag aufnehmen</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Ab nächster Woche hier eingeben. Speichern zählt immer. Liegt die New-Sales-API, geht der Abschluss mit. Sonst in New Sales nachtragen und die Nummer am Auftrag speichern.
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
        <p className="text-xs uppercase tracking-[0.16em] text-gold">Lieferadresse & Vertragspartner</p>
        <Field label="Anrede">
          <Select value={salutation} onChange={(e) => setSalutation(e.target.value)}>
            <option>Herr</option>
            <option>Frau</option>
            <option>Divers</option>
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Vorname">
            <Input value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" />
          </Field>
          <Field label="Nachname">
            <Input value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" />
          </Field>
        </div>
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
        <Field label="Geburtstag">
          <Input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} />
        </Field>
      </div>

      <div className="mt-4 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline">
        <p className="text-xs uppercase tracking-[0.16em] text-gold">Kontaktdaten</p>
        <Field label="Festnetz">
          <Input value={landline} onChange={(e) => setLandline(e.target.value)} inputMode="tel" />
        </Field>
        <Field label="Mobilfunknummer">
          <Input value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" autoComplete="tel" />
        </Field>
        <p className="text-xs text-muted">Mindestens eine Nummer.</p>
        <Field label="E-Mail">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />
        </Field>
      </div>

      <div className="mt-4 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline">
        <p className="text-xs uppercase tracking-[0.16em] text-gold">Vergleich</p>
        <Field label="Bisheriger Anbieter">
          <Input value={providerOld} onChange={(e) => setProviderOld(e.target.value)} placeholder="Steht auf der Rechnung" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Arbeitspreis bisher ct/kWh">
            <Input
              value={oldArbeit}
              onChange={(e) => setOldArbeit(e.target.value.replace(/[^\d,.]/g, ""))}
              inputMode="decimal"
              placeholder="z. B. 32,14"
            />
          </Field>
          <Field label="Grundpreis bisher EUR / Jahr">
            <Input
              value={oldGrund}
              onChange={(e) => setOldGrund(e.target.value.replace(/[^\d,.]/g, ""))}
              inputMode="decimal"
              placeholder="z. B. 156,00"
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sparte">
            <Select value={type} onChange={(e) => setType(e.target.value === "gas" ? "gas" : "strom")}>
              <option value="strom">Strom</option>
              <option value="gas">Gas</option>
            </Select>
          </Field>
          <Field label="Jahresverbrauch kWh">
            <Input value={kwh} onChange={(e) => setKwh(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" />
          </Field>
        </div>
        <Button
          type="button"
          disabled={comparing}
          onClick={async () => {
            if (zip.replace(/\D/g, "").length !== 5) {
              toast.error("Zuerst PLZ und Adresse.");
              return;
            }
            if (!Number(kwh)) {
              toast.error("Verbrauch in kWh angeben.");
              return;
            }
            const arbeit = Number(oldArbeit.replace(",", "."));
            const grund = Number(oldGrund.replace(",", "."));
            if (!arbeit) {
              toast.error("Arbeitspreis von der letzten Rechnung.");
              return;
            }
            if (!Number.isFinite(grund) || oldGrund.trim() === "") {
              toast.error("Grundpreis von der letzten Rechnung (EUR im Jahr).");
              return;
            }
            setComparing(true);
            try {
              const res = await compareTariffs({
                data: {
                  zip,
                  kwh: Number(kwh),
                  type: type === "gas" ? "gas" : "strom",
                  stufe: staff.length ? staff.find((s) => s.user_id === forStaff)?.commission_stufe || stufe : stufe,
                  previousProvider: providerOld,
                  currentArbeitCt: arbeit,
                  currentGrundYear: grund,
                },
              });
              setCompare(res);
              if (res.winner) {
                setTariffId(res.winner.tariffId);
                setType(res.winner.type);
                setProvider(res.winner.provider);
              } else {
                toast.error("Kein Tarif im Katalog für diesen Verbrauch.");
              }
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Vergleich fehlgeschlagen");
            } finally {
              setComparing(false);
            }
          }}
        >
          {comparing ? "Prüft…" : "Vergleich starten"}
        </Button>
        {compare?.winner ? (
          <article className="rounded-2xl bg-elevated p-4 gold-hairline">
            <p className="text-xs uppercase tracking-[0.18em] text-gold">Preis-Leistung</p>
            <p className="mt-2 text-lg font-medium">
              {compare.winner.provider} · {compare.winner.name}
            </p>
            <p className="mt-3 font-display text-3xl tabular-nums">{eur(compare.winner.advisor)}</p>
            <p className="mt-1 text-sm text-muted">
              netto · + {eur(compare.winner.advisorGross - compare.winner.advisor)} USt 19% = {eur(compare.winner.advisorGross)} brutto
            </p>
            <p className="mt-2 text-xs text-muted">
              Berater Stufe {compare.winner.stufe} · Liste netto, zzgl. 19% USt
            </p>
            <p className="mt-3 text-sm">
              Heute {eur(compare.currentYear)} / Jahr. Vergleich {eur(compare.winner.yearEur)} / Jahr.
              {compare.saveYear > 0 ? ` Ersparnis ca. ${eur(compare.saveYear)} / Jahr.` : compare.saveYear < 0 ? ` Vergleich liegt ${eur(Math.abs(compare.saveYear))} höher.` : ""}
            </p>
            {!compare.live ? (
              <p className="mt-2 text-xs text-muted">
                Vergleich aus dem Katalog. Sobald TARIFRECHNER_API_URL steht, kommen die echten PLZ-Preise.
              </p>
            ) : null}
          </article>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline">
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
        <p className="text-xs uppercase tracking-[0.16em] text-gold">Bankverbindung — optional</p>
        <p className="text-sm text-muted">Leer lassen geht. Prüfen füllt BLZ und Konto aus der IBAN.</p>
        <Field label="IBAN">
          <Input value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())} autoComplete="off" />
        </Field>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              try {
                const p = deBankFromIban(iban);
                if (!p.blz) {
                  toast.error("IBAN unvollständig");
                  return;
                }
                setBlz(p.blz);
                setAccount(p.account);
                if (!bankOwner.trim()) setBankOwner(`${first} ${last}`.trim());
                toast.success("BLZ und Konto aus IBAN");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "IBAN ungültig");
              }
            }}
          >
            prüfen
          </Button>
        </div>
        <Field label="Kontoinhaber">
          <Input value={bankOwner} onChange={(e) => setBankOwner(e.target.value)} />
        </Field>
        <Field label="BIC">
          <Input value={bic} onChange={(e) => setBic(e.target.value.toUpperCase())} />
        </Field>
        <Field label="Name der Bank">
          <Input value={bankName} onChange={(e) => setBankName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="BLZ">
            <Input value={blz} onChange={(e) => setBlz(e.target.value)} />
          </Field>
          <Field label="Konto">
            <Input value={account} onChange={(e) => setAccount(e.target.value)} />
          </Field>
        </div>
        {iban.trim() ? (
          <CheckboxRow checked={sepa} onChange={setSepa}>
            SEPA-Lastschriftmandat erteilt
          </CheckboxRow>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline">
        <p className="text-xs uppercase tracking-[0.16em] text-gold">Liefertermin & Vorversorger</p>
        <Field label="Art">
          <Select value={deliveryKind} onChange={(e) => setDeliveryKind(e.target.value as "wechsel" | "neueinzug")}>
            <option value="wechsel">Lieferantenwechsel</option>
            <option value="neueinzug">Neueinzug</option>
          </Select>
        </Field>
        <Field label="gew. Lieferdatum">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="Zählernummer">
          <Input value={meter} onChange={(e) => setMeter(e.target.value)} />
        </Field>
        <Field label="MeLo-ID">
          <Input value={melo} onChange={(e) => setMelo(e.target.value)} />
        </Field>
        <Field label="MaLo-ID">
          <Input value={malo} onChange={(e) => setMalo(e.target.value)} />
        </Field>
        <Field label="abw. Messstellennetzbetreiber">
          <Input value={grid} onChange={(e) => setGrid(e.target.value)} />
        </Field>
        <Field label="Bish. Kundennummer">
          <Input value={prevNo} onChange={(e) => setPrevNo(e.target.value)} />
        </Field>
        <Field label="Vorversorger">
          <Input value={providerOld} onChange={(e) => setProviderOld(e.target.value)} />
        </Field>
        <Field label="Altvertrag gekündigt zum">
          <Input type="date" value={oldEnd} onChange={(e) => setOldEnd(e.target.value)} />
        </Field>
        <Field label="Datum der Unterschrift">
          <Input type="date" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} />
        </Field>
      </div>

      <div className="mt-4 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline">
        <CheckboxRow checked={digitalSign} onChange={setDigitalSign}>
          Kunde wünscht die digitale Unterschrift
        </CheckboxRow>
        <CheckboxRow checked={early} onChange={setEarly}>
          Lieferung vor Ablauf der Widerrufsfrist möglich — Widerrufsrecht bleibt
        </CheckboxRow>
        <CheckboxRow checked={postInvoice} onChange={setPostInvoice}>
          Rechnung per Post (kann Kosten verursachen)
        </CheckboxRow>
        <Field label="Vertrag / Scan">
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
              reader.onload = () => setScan({ name: f.name, base64: String(reader.result || "") });
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

      <div className="mt-4 grid gap-2 rounded-3xl bg-surface p-5 gold-hairline sm:grid-cols-2">
        <Button variant="outline" className="w-full" disabled={busy || !quote?.ok} onClick={() => void save(true)}>
          {busy ? "Speichert…" : "Parken"}
        </Button>
        <Button className="w-full" disabled={busy || !quote?.ok} onClick={() => void save(false)}>
          {busy ? "Speichert…" : "Auftrag buchen"}
        </Button>
      </div>
    </div>
  );
}
