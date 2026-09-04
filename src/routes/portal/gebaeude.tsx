import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getBuilding, listBuildings, setUnitStatus, upsertBuilding } from "@/lib/server/building-api";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/gebaeude")({ component: Page });

function Page() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listBuildings>>>([]);
  const [street, setStreet] = useState("");
  const [house, setHouse] = useState("");
  const [zip, setZip] = useState("");
  const [city, setCity] = useState("");
  const [floors, setFloors] = useState("3");
  const [per, setPer] = useState("4");
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getBuilding>>>(null);
  function load() {
    listBuildings().then(setRows).catch(() => setRows([]));
  }
  useEffect(load, []);
  useEffect(() => {
    if (!open) {
      setDetail(null);
      return;
    }
    const row = rows.find((r) => r.id === open);
    if (!row) return;
    getBuilding({ data: { street: row.street, house: row.house } }).then(setDetail).catch(() => setDetail(null));
  }, [open, rows]);
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.22em] text-gold">Feld</p>
      <h1 className="mt-1 font-display text-4xl">Gebäude</h1>
      <p className="mt-2 text-sm text-muted">
        Haus, Etagen, Wohneinheiten. Die App nutzt dasselbe. Nicht angetroffen und Abschluss hängen am Haus.
      </p>
      <form
        className="mt-6 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline md:grid-cols-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = Math.max(1, Number(floors) || 1);
          const n = Math.max(1, Number(per) || 1);
          const units = [];
          for (let fl = 0; fl < f; fl++) {
            for (let i = 1; i <= n; i++) units.push({ floor: fl, no: `${fl === 0 ? "EG" : fl}.${i}` });
          }
          try {
            await upsertBuilding({ data: { street, house, zip, city, floors: f, units } });
            toast.success("Gebäude gespeichert");
            setStreet("");
            setHouse("");
            load();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Nicht gespeichert");
          }
        }}
      >
        <Field label="Straße">
          <Input value={street} onChange={(e) => setStreet(e.target.value)} required />
        </Field>
        <Field label="Hausnr.">
          <Input value={house} onChange={(e) => setHouse(e.target.value)} required />
        </Field>
        <Field label="PLZ">
          <Input value={zip} onChange={(e) => setZip(e.target.value)} />
        </Field>
        <Field label="Ort">
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
        </Field>
        <Field label="Etagen inkl. EG">
          <Input inputMode="numeric" value={floors} onChange={(e) => setFloors(e.target.value)} />
        </Field>
        <Field label="WE je Etage">
          <Input inputMode="numeric" value={per} onChange={(e) => setPer(e.target.value)} />
        </Field>
        <div className="md:col-span-3">
          <Button type="submit">Gebäude anlegen</Button>
        </div>
      </form>
      <div className="mt-6 grid gap-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-2xl bg-surface p-4 gold-hairline">
            <button type="button" className="w-full text-left" onClick={() => setOpen(open === r.id ? null : r.id)}>
              <p className="font-medium">
                {r.street} {r.house}
              </p>
              <p className="text-sm text-muted">
                {r.zip} {r.city} · {r.floors} Etagen · {r.units} WE
              </p>
            </button>
            {open === r.id && detail ? (
              <ul className="mt-3 grid gap-1 text-sm">
                {detail.units.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2">
                    <span>
                      {u.floor === 0 ? "EG" : `${u.floor}. OG`} · {u.no} · {u.status}
                    </span>
                    <select
                      className="rounded-lg border border-line bg-bg px-2 py-1 text-xs"
                      value={u.status}
                      onChange={async (e) => {
                        await setUnitStatus({ data: { id: u.id, status: e.target.value } });
                        getBuilding({ data: { street: r.street, house: r.house } }).then(setDetail);
                      }}
                    >
                      <option value="offen">offen</option>
                      <option value="nicht_angetroffen">nicht angetroffen</option>
                      <option value="kunde">Kunde</option>
                      <option value="kein_interesse">kein Interesse</option>
                    </select>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
        {!rows.length ? <p className="text-sm text-muted">Noch keine Gebäude. Anlegen oder in der App WE setzen.</p> : null}
      </div>
    </div>
  );
}
