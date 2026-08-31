import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listRegions, saveRegion } from "@/lib/server/api";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/admin/regionen")({ component: Page });

function Page() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listRegions>>>([]);
  const [name, setName] = useState("");
  const [bundesland, setB] = useState("");
  const [plz, setPlz] = useState("");
  function load() {
    listRegions().then(setRows);
  }
  useEffect(load, []);
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-4xl">Regionen</h1>
      <p className="text-sm text-muted">Bundesweite Steuerung über Regionen / Bundesländer / PLZ.</p>
      <form
        className="mt-6 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline"
        onSubmit={async (e) => {
          e.preventDefault();
          await saveRegion({ data: { name, bundesland, plz_ranges: plz } });
          toast.success("Region gespeichert");
          setName("");
          setB("");
          setPlz("");
          load();
        }}
      >
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Bundesländer">
          <Input value={bundesland} onChange={(e) => setB(e.target.value)} />
        </Field>
        <Field label="PLZ-Bereiche">
          <Input value={plz} onChange={(e) => setPlz(e.target.value)} />
        </Field>
        <Button type="submit">Region anlegen</Button>
      </form>
      <div className="mt-4 grid gap-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-2xl bg-surface p-4 gold-hairline">
            <p className="font-medium">{r.name}</p>
            <p className="text-xs text-muted">
              {r.bundesland} · {r.plz_ranges}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
