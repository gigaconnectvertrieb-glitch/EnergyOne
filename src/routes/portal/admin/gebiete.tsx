import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { assignTerritory, listTerritories, uploadTerritory } from "@/lib/server/field-api";
import { listRegions, listUsers } from "@/lib/server/api";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/admin/gebiete")({ component: Page });

function Page() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listTerritories>>>([]);
  const [users, setUsers] = useState<Awaited<ReturnType<typeof listUsers>>>([]);
  const [regions, setRegions] = useState<Awaited<ReturnType<typeof listRegions>>>([]);
  const [name, setName] = useState("");
  const [userId, setUserId] = useState("");
  const [regionId, setRegionId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    listTerritories().then(setRows).catch(() => setRows([]));
    listUsers().then(setUsers).catch(() => setUsers([]));
    listRegions().then(setRegions).catch(() => setRegions([]));
  }
  useEffect(load, []);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-4xl">Gebiete aufspielen</h1>
      <p className="mt-2 text-sm text-muted">
        Datei (GeoJSON oder CSV). Für Städte und Tagespläne:{" "}
        <a href="/portal/planung" className="text-gold">
          Gebietsplanung
        </a>
        .
      </p>
      <form
        className="mt-6 grid gap-3 rounded-3xl bg-surface p-5 gold-hairline"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!file) {
            toast.error("Datei wählen");
            return;
          }
          setBusy(true);
          try {
            const text = await file.text();
            const res = await uploadTerritory({
              data: { name, filename: file.name, text, userId, regionId },
            });
            toast.success(`${res.doors} Türen aufgespielt`);
            setName("");
            setFile(null);
            load();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Upload fehlgeschlagen");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Berlin Prenzlauer Berg" />
        </Field>
        <Field label="Mitarbeiter">
          <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Später zuweisen</option>
            {users.map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {u.first_name} {u.last_name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Region">
          <Select value={regionId} onChange={(e) => setRegionId(e.target.value)}>
            <option value="">—</option>
            {regions.map((r) => (
              <option key={String(r.id)} value={String(r.id)}>
                {String(r.name)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Datei" hint="GeoJSON oder CSV: street;house;zip;city;lat;lng">
          <Input type="file" accept=".geojson,.json,.csv,.txt" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? "Spielt auf…" : "Aufspielen"}
        </Button>
      </form>
      <div className="mt-6 grid gap-2">
        {rows.map((t) => (
          <div key={t.id} className="rounded-2xl bg-surface p-4 gold-hairline">
            <p className="font-medium">{t.name}</p>
            <p className="text-xs text-muted">
              {t.door_count} Türen · {t.advisor || "nicht zugewiesen"} · {t.filename}
            </p>
            <Select
              className="mt-2"
              value={t.user_id}
              onChange={async (e) => {
                await assignTerritory({ data: { id: t.id, userId: e.target.value } });
                toast.success("Zugewiesen");
                load();
              }}
            >
              <option value="">Mitarbeiter</option>
              {users.map((u) => (
                <option key={u.user_id} value={u.user_id}>
                  {u.first_name} {u.last_name}
                </option>
              ))}
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}
