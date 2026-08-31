import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FieldMap } from "@/components/field-map";
import { getMyTerritory, logFieldVisit } from "@/lib/server/field-api";
import { VISIT_LABELS, VISIT_REASONS, type VisitReason } from "@/lib/field";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/app/karte")({ component: Page });

function Page() {
  const [pack, setPack] = useState<Awaited<ReturnType<typeof getMyTerritory>> | null>(null);
  const [door, setDoor] = useState<{
    id: string;
    street: string;
    house: string;
    zip: string;
    city: string;
    lat: number;
    lng: number;
    note: string;
    status: string;
  } | null>(null);
  const [reason, setReason] = useState<VisitReason>("nicht_angetroffen");
  const [note, setNote] = useState("");
  const [routeTo, setRouteTo] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    getMyTerritory()
      .then((d) => setPack(d as typeof pack))
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Fehler"));
  }, []);

  const geojson = useMemo(() => {
    if (!pack || typeof pack !== "object" || !("geojsonText" in pack)) return null;
    try {
      return JSON.parse(String(pack.geojsonText || "")) as Record<string, unknown>;
    } catch {
      return null;
    }
  }, [pack]);

  const doors = pack && "doors" in pack ? pack.doors : [];
  const center =
    pack && "center_lat" in pack
      ? { lat: pack.center_lat, lng: pack.center_lng }
      : { lat: 51.16, lng: 10.45 };

  return (
    <div>
      <h1 className="font-display text-3xl">Karte</h1>
      <p className="mt-1 text-sm text-muted">Satellit, Route, Tür antippen.</p>
      <div className="mt-4">
        {pack ? (
          <FieldMap
            center={center}
            geojson={geojson}
            doors={doors}
            routeTo={routeTo}
            onDoor={(d) => {
              setDoor({ ...d, note: d.note || "", house: d.house || "", zip: d.zip || "", city: d.city || "" });
              setRouteTo({ lat: d.lat, lng: d.lng });
            }}
          />
        ) : (
          <div className="h-64 animate-pulse rounded-3xl bg-surface" />
        )}
      </div>
      {door ? (
        <div className="mt-4 rounded-3xl bg-surface p-4 gold-hairline">
          <p className="font-medium">
            {door.street} {door.house}
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
          <Button
            className="mt-3 w-full"
            onClick={async () => {
              await logFieldVisit({
                data: {
                  doorId: door.id,
                  reason,
                  note,
                  street: door.street,
                  house: door.house,
                  zip: door.zip,
                  city: door.city,
                  lat: door.lat,
                  lng: door.lng,
                },
              });
              toast.success("Gespeichert");
              setDoor(null);
              setNote("");
            }}
          >
            Speichern
          </Button>
        </div>
      ) : null}
    </div>
  );
}
