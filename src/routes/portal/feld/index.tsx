import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FieldMap } from "@/components/field-map";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { downloadMyTerritory, getMyTerritory, logFieldVisit } from "@/lib/server/field-api";
import { VISIT_LABELS, VISIT_REASONS, type VisitReason } from "@/lib/field";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/feld/")({ component: Page });

type Door = {
  id: string;
  street: string;
  house: string;
  zip: string;
  city: string;
  lat: number;
  lng: number;
  note: string;
  status: string;
  territory_id?: string;
};

function Page() {
  const [pack, setPack] = useState<{
    name: string;
    center_lat: number;
    center_lng: number;
    geojsonText: string;
    doors: Door[];
  } | null>(null);
  const [door, setDoor] = useState<Door | null>(null);
  const [reason, setReason] = useState<VisitReason>("nicht_angetroffen");
  const [note, setNote] = useState("");
  const [routeTo, setRouteTo] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    getMyTerritory()
      .then((d) =>
        setPack({
          name: d.name,
          center_lat: d.center_lat,
          center_lng: d.center_lng,
          geojsonText: d.geojsonText,
          doors: d.doors,
        }),
      )
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Fehler"));
  }
  useEffect(load, []);

  const center = useMemo(
    () => (pack ? { lat: pack.center_lat, lng: pack.center_lng } : { lat: 51.16, lng: 10.45 }),
    [pack],
  );
  const geojson = useMemo(() => {
    if (!pack?.geojsonText) return null;
    try {
      return JSON.parse(pack.geojsonText) as Record<string, unknown>;
    } catch {
      return null;
    }
  }, [pack]);

  async function save() {
    setBusy(true);
    try {
      const res = await logFieldVisit({
        data: {
          doorId: door?.id,
          reason,
          note,
          street: door?.street,
          house: door?.house,
          zip: door?.zip,
          city: door?.city,
          lat: door?.lat,
          lng: door?.lng,
        },
      });
      toast.success(res.follow_up_on ? `Nachlauf ${res.follow_up_on}` : "Gespeichert");
      setDoor(null);
      setNote("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pb-8">
      <p className="text-xs uppercase tracking-[0.2em] text-gold">Feld-App</p>
      <h1 className="mt-1 font-display text-4xl">{pack?.name || "Gebiet"}</h1>
      <p className="mt-2 text-sm text-muted">
        Satellit + Route. Nicht angetroffen sofort eintragen. Aufs Handy legen: Teilen → Zum Home-Bildschirm.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              const file = await downloadMyTerritory();
              const blob = new Blob([file.json], { type: "application/geo+json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = file.filename;
              a.click();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Kein Gebiet");
            }
          }}
        >
          Gebiet herunterladen
        </Button>
        <Link to="/portal/feld/woche" className="rounded-lg px-3 py-2 text-sm gold-hairline">
          Wochenliste
        </Link>
      </div>

      <div className="mt-5">
        {pack ? (
          <FieldMap
            center={center}
            geojson={geojson}
            doors={pack.doors}
            routeTo={routeTo}
            onDoor={(d) => {
              setDoor({ ...d, note: d.note || "", territory_id: "" });
              setRouteTo({ lat: d.lat, lng: d.lng });
            }}
          />
        ) : (
          <div className="h-64 animate-pulse rounded-3xl bg-surface" />
        )}
      </div>

      {door ? (
        <div className="mt-4 rounded-3xl bg-surface p-5 gold-hairline">
          <p className="font-medium">
            {door.street} {door.house}
          </p>
          <p className="text-sm text-muted">
            {door.zip} {door.city}
            {door.note ? ` · ${door.note}` : ""}
          </p>
          <Field label="Ergebnis">
            <Select value={reason} onChange={(e) => setReason(e.target.value as VisitReason)}>
              {VISIT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {VISIT_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notiz">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void save()}>
              Speichern
            </Button>
            <Button variant="outline" onClick={() => setDoor(null)}>
              Schließen
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">Tür auf der Karte antippen. Gold = noch offen.</p>
      )}

      <div className="mt-6 grid gap-2">
        {(pack?.doors || []).map((d) => (
          <button
            key={d.id}
            type="button"
            className="flex min-h-11 items-center justify-between rounded-2xl bg-surface px-4 text-left gold-hairline"
            onClick={() => {
              setDoor(d);
              setRouteTo({ lat: d.lat, lng: d.lng });
            }}
          >
            <span>
              {d.street} {d.house}
            </span>
            <span className="text-xs text-muted">{d.status}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
