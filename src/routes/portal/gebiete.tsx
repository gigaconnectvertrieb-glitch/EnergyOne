/**
 * E1 Gebiete – Straßen aufspielen
 * --------------------------------
 * Leitung sucht Ort/Zone, wählt Mitarbeiter, spielt Adressen auf.
 * Mitarbeiter sehen ihr Gebiet unter „Heute“ / Tour.
 *
 * Ersetzt: src/routes/portal/gebiete.tsx
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { listUsers, bootstrapMe } from "@/lib/server/api";
import {
  assignWorkDay,
  deleteWorkPlan,
  getWorkPlan,
  importCityPlan,
  listWorkPlans,
  searchPlaces,
  streetsInZone,
} from "@/lib/server/plan-api";
import {
  assignTerritory,
  deleteTerritory,
  downloadTerritory,
  listTerritories,
  listTerritoryRequests,
  approveTerritoryRequest,
} from "@/lib/server/field-api";
import { FieldMap } from "@/components/field-map";
import { bboxAround, bboxFromPoints } from "@/lib/geo-de";
import { can } from "@/lib/e1";
import { toast } from "sonner";
import { Map, Users, Download, Trash2 } from "lucide-react";

export const Route = createFileRoute("/portal/gebiete")({ component: Page });

type Place = {
  name: string;
  state?: string;
  lat: number;
  lng: number;
  south: number;
  north: number;
  west: number;
  east: number;
};

function Page() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Place[]>([]);
  const [place, setPlace] = useState<Place | null>(null);
  const [km, setKm] = useState(2.2);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [users, setUsers] = useState<Awaited<ReturnType<typeof listUsers>>>([]);
  const [plans, setPlans] = useState<Awaited<ReturnType<typeof listWorkPlans>>>([]);
  const [ters, setTers] = useState<Awaited<ReturnType<typeof listTerritories>>>([]);
  const [open, setOpen] = useState<Awaited<ReturnType<typeof getWorkPlan>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [corners, setCorners] = useState<{ lat: number; lng: number }[]>([]);
  const [groups, setGroups] = useState<Array<{ street: string; houses: string[]; house?: string }>>([]);
  const [requests, setRequests] = useState<Awaited<ReturnType<typeof listTerritoryRequests>>>([]);

  function reload() {
    listWorkPlans().then(setPlans).catch(() => setPlans([]));
    listUsers().then(setUsers).catch(() => setUsers([]));
    listTerritories().then(setTers).catch(() => setTers([]));
    listTerritoryRequests()
      .then(setRequests)
      .catch(() => setRequests([]));
  }

  useEffect(reload, []);
  useEffect(() => {
    bootstrapMe()
      .then((m) => setAllowed(can(m.profile.role, "team.view")))
      .catch(() => setAllowed(false));
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      searchPlaces({ data: { q } })
        .then(setHits)
        .catch(() => setHits([]));
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  if (allowed === null) {
    return <div className="h-40 animate-pulse rounded-3xl bg-surface" />;
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl bg-surface p-8 gold-hairline">
        <p className="text-[11px] uppercase tracking-[0.22em] text-gold">Gebiete</p>
        <h1 className="mt-1 font-display text-4xl">Ihr Gebiet</h1>
        <p className="mt-3 text-sm text-muted">
          Straßen und Touren spielt die Leitung auf. Unter „Heute“ sehen Sie Ihr
          zugewiesenes Gebiet und können die Tour öffnen.
        </p>
        <Link to="/portal" className="mt-5 inline-block text-sm text-gold">
          Zurück zu Heute →
        </Link>
      </div>
    );
  }

  const box = place ? bboxAround(place.lat, place.lng, km) : null;
  const fieldUsers = users.filter((u) =>
    ["super_admin", "gebietsleiter", "teamleiter", "vertrieb", "partner"].includes(u.role),
  );

  async function loadZone(pts: { lat: number; lng: number }[]) {
    if (pts.length < 3) return;
    setBusy(true);
    try {
      const res = await streetsInZone({ data: { corners: pts } });
      setGroups(res.streets || []);
      toast.success(
        res.houseCount
          ? `${res.streetCount} Straßen · ${res.houseCount} Hausnummern`
          : `${res.count} Straßen`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Zone laden fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function aufspielen(fullCity: boolean) {
    if (!place) return;
    if (!userIds.length) {
      toast.error("Mindestens einen Mitarbeiter anhaken.");
      return;
    }
    setBusy(true);
    try {
      const cityBox = {
        south: place.south,
        north: place.north,
        west: place.west,
        east: place.east,
      };
      const drawn = corners.length >= 3 ? bboxFromPoints(corners) : box;
      const res = await importCityPlan({
        data: {
          name: fullCity ? place.name : `${place.name} Zone`,
          city: place.name,
          state: place.state,
          lat: place.lat,
          lng: place.lng,
          ...(fullCity ? cityBox : drawn || cityBox),
          userIds,
          full: fullCity,
          corners: !fullCity && corners.length >= 3 ? corners : undefined,
          zip: /^\d{5}/.test(place.name)
            ? place.name.slice(0, 5)
            : /^\d{5}$/.test(q.trim())
              ? q.trim()
              : undefined,
        },
      });
      toast.success(
        res.houses || res.streets
          ? `${res.houses || res.streets} Adressen aufgespielt`
          : "Gebiet zugewiesen.",
      );
      if (res.territoryId) {
        try {
          await downloadTerritory({ data: { id: res.territoryId } });
        } catch {
          /* optional */
        }
      }
      reload();
      if (res.planId) {
        const detail = await getWorkPlan({ data: { id: res.planId } });
        setOpen(detail);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Aufspielen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-[11px] uppercase tracking-[0.22em] text-gold">Steuerung</p>
      <h1 className="mt-1 font-display text-4xl">Gebiete aufspielen</h1>
      <p className="mt-1 text-sm text-muted">
        Ort suchen · Mitarbeiter wählen · Straßen zuweisen
      </p>

      {/* 1. Ort */}
      <section className="mt-6 rounded-3xl bg-surface p-5 gold-hairline">
        <div className="flex items-center gap-2">
          <Map className="size-4 text-gold" />
          <p className="text-xs uppercase tracking-[0.16em] text-gold">1 · Ort oder PLZ</p>
        </div>
        <Field label="Suche" className="mt-3">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="z. B. Köln Nippes oder 50733"
          />
        </Field>
        {hits.length > 0 && (
          <ul className="mt-2 max-h-48 overflow-y-auto rounded-xl bg-elevated">
            {hits.map((h, i) => (
              <li key={`${h.name}-${i}`}>
                <button
                  type="button"
                  className="w-full px-3 py-2.5 text-left text-sm hover:bg-surface"
                  onClick={() => {
                    setPlace(h);
                    setHits([]);
                    setQ(h.name);
                    setCorners([]);
                    setGroups([]);
                  }}
                >
                  {h.name}
                  {h.state ? ` · ${h.state}` : ""}
                </button>
              </li>
            ))}
          </ul>
        )}
        {place && (
          <p className="mt-3 text-sm">
            Gewählt: <span className="font-medium">{place.name}</span>
          </p>
        )}
        {place && (
          <Field label="Radius begrenzen (km)" className="mt-3">
            <Input
              type="number"
              min={1}
              max={8}
              step={0.2}
              value={km}
              onChange={(e) => setKm(Number(e.target.value))}
            />
          </Field>
        )}
        {place && box && (
          <div className="mt-4 overflow-hidden rounded-2xl">
            <FieldMap
              center={{ lat: place.lat, lng: place.lng }}
              bbox={box}
              corners={corners}
              onCornersChange={setCorners}
            />
          </div>
        )}
        {place && corners.length >= 3 && (
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            disabled={busy}
            onClick={() => void loadZone(corners)}
          >
            {busy ? "Lädt…" : "Straßen der Zone listen"}
          </Button>
        )}
        {groups.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            {groups.length} Straßen ·{" "}
            {groups.reduce((n, g) => n + (g.houses?.length || 0), 0)} Hausnummern
          </p>
        )}
      </section>

      {/* 2. Mitarbeiter */}
      <section className="mt-4 rounded-3xl bg-surface p-5 gold-hairline">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-gold" />
          <p className="text-xs uppercase tracking-[0.16em] text-gold">2 · Mitarbeiter</p>
        </div>
        <div className="mt-3 grid gap-2">
          {fieldUsers.length === 0 && (
            <p className="text-sm text-muted">Keine Mitarbeiter geladen.</p>
          )}
          {fieldUsers.map((u) => {
            const on = userIds.includes(u.user_id);
            return (
              <label
                key={u.user_id}
                className="flex min-h-11 items-center gap-3 rounded-xl bg-elevated px-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    setUserIds((prev) =>
                      on ? prev.filter((id) => id !== u.user_id) : [...prev, u.user_id],
                    )
                  }
                />
                {u.first_name} {u.last_name}
                <span className="ml-auto text-xs text-muted">{u.role}</span>
              </label>
            );
          })}
        </div>
      </section>

      {/* 3. Aufspielen */}
      <section className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button
          disabled={busy || !place || !userIds.length}
          onClick={() => void aufspielen(true)}
        >
          {busy ? "Spielt auf…" : "Gesamten Ort aufspielen"}
        </Button>
        <Button
          variant="outline"
          disabled={busy || !place || !userIds.length}
          onClick={() => void aufspielen(false)}
        >
          {busy ? "Spielt auf…" : "Nur Zone / Karte aufspielen"}
        </Button>
      </section>

      {/* Anfragen */}
      {requests.length > 0 && (
        <section className="mt-8">
          <p className="text-sm font-medium">Offene Gebietsanfragen</p>
          <ul className="mt-2 space-y-2">
            {requests.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface px-4 py-3 gold-hairline"
              >
                <div>
                  <p className="text-sm font-medium">{r.name || r.id}</p>
                  <p className="text-xs text-muted">{r.advisor || ""}</p>
                </div>
                <Button
                  type="button"
                  className="h-9 text-xs"
                  onClick={async () => {
                    try {
                      await approveTerritoryRequest({ data: { id: r.id } });
                      toast.success("Freigegeben");
                      reload();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Fehler");
                    }
                  }}
                >
                  Freigeben
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Bestehende Gebiete */}
      <section className="mt-8">
        <p className="text-sm font-medium">Zugewiesene Gebiete</p>
        <ul className="mt-2 space-y-2">
          {ters.length === 0 && (
            <li className="rounded-2xl bg-surface p-6 text-center text-sm text-muted gold-hairline">
              Noch keine Gebiete.
            </li>
          )}
          {ters.map((t) => (
            <li
              key={t.id}
              className="rounded-2xl bg-surface px-4 py-3 gold-hairline"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted">
                    {t.advisor || "nicht zugewiesen"} · {t.door_count ?? 0} Adressen
                    {!t.active ? " · inaktiv" : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={t.user_id || ""}
                    onChange={async (e) => {
                      const userId = e.target.value;
                      if (!userId) return;
                      try {
                        await assignTerritory({ data: { id: t.id, userId } });
                        toast.success("Mitarbeiter zugewiesen");
                        reload();
                      } catch (err) {
                        toast.error(
                          err instanceof Error ? err.message : "Zuweisen fehlgeschlagen",
                        );
                      }
                    }}
                  >
                    <option value="">Mitarbeiter</option>
                    {fieldUsers.map((u) => (
                      <option key={u.user_id} value={u.user_id}>
                        {u.first_name} {u.last_name}
                      </option>
                    ))}
                  </Select>
                  <button
                    type="button"
                    className="grid size-9 place-items-center rounded-lg bg-elevated"
                    title="Download"
                    onClick={async () => {
                      try {
                        const file = await downloadTerritory({ data: { id: t.id } });
                        const a = document.createElement("a");
                        a.href = URL.createObjectURL(
                          new Blob([file.json], { type: "application/geo+json" }),
                        );
                        a.download = file.filename || `${t.name}.geojson`;
                        a.click();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Download fehlgeschlagen");
                      }
                    }}
                  >
                    <Download className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="grid size-9 place-items-center rounded-lg bg-elevated text-danger"
                    title="Löschen"
                    onClick={async () => {
                      if (!confirm("Gebiet löschen?")) return;
                      try {
                        await deleteTerritory({ data: { id: t.id } });
                        toast.success("Gelöscht");
                        reload();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Löschen fehlgeschlagen");
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Pläne */}
      {plans.length > 0 && (
        <section className="mt-8">
          <p className="text-sm font-medium">Arbeitspläne</p>
          <ul className="mt-2 space-y-2">
            {plans.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="w-full rounded-2xl bg-surface px-4 py-3 text-left text-sm gold-hairline"
                  onClick={async () => {
                    try {
                      setOpen(await getWorkPlan({ data: { id: p.id } }));
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Laden fehlgeschlagen");
                    }
                  }}
                >
                  <span className="font-medium">{p.name || p.id}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {(p as { day_count?: number }).day_count ?? "—"} Tage
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {open && (
        <section className="mt-4 rounded-3xl bg-surface p-5 gold-hairline">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium">{open.name || open.id}</p>
            <Button
              type="button"
              variant="outline"
              className="h-8 text-xs"
              onClick={async () => {
                if (!confirm("Plan löschen?")) return;
                try {
                  await deleteWorkPlan({ data: { id: open.id } });
                  setOpen(null);
                  reload();
                  toast.success("Plan gelöscht");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Fehler");
                }
              }}
            >
              Plan löschen
            </Button>
          </div>
          <ul className="mt-3 space-y-2">
            {(open.days || []).map((d: { id: string; label?: string; user_id?: string }) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span>{d.label || d.id}</span>
                <Select
                  value={d.user_id || ""}
                  onChange={async (e) => {
                    try {
                      await assignWorkDay({
                        data: { dayId: d.id, userId: e.target.value },
                      });
                      toast.success("Tag zugewiesen");
                      setOpen(await getWorkPlan({ data: { id: open.id } }));
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Fehler");
                    }
                  }}
                >
                  <option value="">Mitarbeiter</option>
                  {fieldUsers.map((u) => (
                    <option key={u.user_id} value={u.user_id}>
                      {u.first_name} {u.last_name}
                    </option>
                  ))}
                </Select>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
