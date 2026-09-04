import { useEffect, useState } from "react";
import { getBuilding, setUnitStatus, upsertBuilding } from "@/lib/server/building-api";
import { Button } from "@/components/ui/button";

export function BuildingPanel({ street, house, zip, city }: { street: string; house: string; zip?: string; city?: string }) {
  const [floors, setFloors] = useState("3");
  const [per, setPer] = useState("2");
  const [units, setUnits] = useState<Array<{ id: string; floor: number; no: string; status: string }>>([]);
  function load() {
    if (!street || !house) return;
    getBuilding({ data: { street, house } })
      .then((b) => {
        if (!b) {
          setUnits([]);
          return;
        }
        setFloors(String(b.floors));
        setUnits(b.units);
      })
      .catch(() => setUnits([]));
  }
  useEffect(load, [street, house]);
  if (!street || !house) return null;
  return (
    <div className="mt-3 rounded-xl border border-black/10 p-3">
      <p className="text-[10px] uppercase tracking-widest text-[#888]">Gebäude</p>
      <div className="mt-2 flex gap-2">
        <input className="h-9 w-16 rounded-lg border px-2 text-sm" value={floors} onChange={(e) => setFloors(e.target.value)} />
        <span className="self-center text-xs text-[#666]">Etagen</span>
        <input className="h-9 w-16 rounded-lg border px-2 text-sm" value={per} onChange={(e) => setPer(e.target.value)} />
        <span className="self-center text-xs text-[#666]">WE/Etage</span>
      </div>
      <Button
        className="mt-2"
        variant="outline"
        onClick={async () => {
          const f = Math.max(1, Number(floors) || 1);
          const n = Math.max(1, Number(per) || 1);
          const list = [];
          for (let fl = 0; fl < f; fl++) for (let i = 1; i <= n; i++) list.push({ floor: fl, no: `${fl === 0 ? "EG" : fl}.${i}` });
          await upsertBuilding({ data: { street, house, zip, city, floors: f, units: list } });
          load();
        }}
      >
        WE anlegen
      </Button>
      {units.length ? (
        <ul className="mt-2 max-h-28 overflow-auto text-xs">
          {units.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-2 py-1">
              <span>
                {u.no} · {u.status}
              </span>
              <select
                value={u.status}
                className="rounded border px-1"
                onChange={async (e) => {
                  await setUnitStatus({ data: { id: u.id, status: e.target.value } });
                  load();
                }}
              >
                <option value="offen">offen</option>
                <option value="nicht_angetroffen">nicht da</option>
                <option value="kunde">Kunde</option>
                <option value="kein_interesse">kein Interesse</option>
              </select>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
