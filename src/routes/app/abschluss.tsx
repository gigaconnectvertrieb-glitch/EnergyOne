import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { createContract, listTariffs } from "@/lib/server/api";
import { toast } from "sonner";

export const Route = createFileRoute("/app/abschluss")({ component: Page });

function Page() {
  const [tariffs, setTariffs] = useState<Awaited<ReturnType<typeof listTariffs>>>([]);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [house, setHouse] = useState("");
  const [zip, setZip] = useState("");
  const [city, setCity] = useState("");
  const [kwh, setKwh] = useState("");
  const [tariffId, setTariffId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listTariffs()
      .then((rows) => {
        const live = rows.filter((t) => t.provider !== "E1");
        setTariffs(live);
        if (live[0]) setTariffId(live[0].id);
      })
      .catch(() => setTariffs([]));
  }, []);

  async function save(parked: boolean) {
    setBusy(true);
    try {
      await createContract({
        data: {
          firstName: first,
          lastName: last,
          phone,
          street,
          houseNumber: house,
          zip,
          city,
          tariffId,
          consumptionKwh: Number(kwh) || 0,
          privacyConfirmed: true,
          parked,
        },
      });
      toast.success(parked ? "Geparkt" : "Gebucht");
      setFirst("");
      setLast("");
      setPhone("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nicht gespeichert");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.22em] text-gold">An der Tür</p>
      <h1 className="mt-1 font-display text-4xl">Abschluss</h1>
      <p className="mt-2 text-sm text-muted">Kurz aufnehmen. IBAN nicht nötig. New Sales später oder per API.</p>
      <div className="mt-5 grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vorname">
            <Input value={first} onChange={(e) => setFirst(e.target.value)} />
          </Field>
          <Field label="Nachname">
            <Input value={last} onChange={(e) => setLast(e.target.value)} />
          </Field>
        </div>
        <Field label="Telefon">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
        </Field>
        <div className="grid grid-cols-[1fr_4.5rem] gap-3">
          <Field label="Straße">
            <Input value={street} onChange={(e) => setStreet(e.target.value)} />
          </Field>
          <Field label="Nr.">
            <Input value={house} onChange={(e) => setHouse(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-[6.5rem_1fr] gap-3">
          <Field label="PLZ">
            <Input value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" />
          </Field>
          <Field label="Ort">
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
        </div>
        <Field label="kWh / Jahr">
          <Input value={kwh} onChange={(e) => setKwh(e.target.value.replace(/\D/g, ""))} inputMode="numeric" />
        </Field>
        <Field label="Tarif">
          <Select value={tariffId} onChange={(e) => setTariffId(e.target.value)}>
            {tariffs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.provider} · {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void save(true)}>
            Parken
          </Button>
          <Button disabled={busy} onClick={() => void save(false)}>
            Buchen
          </Button>
        </div>
      </div>
    </div>
  );
}
