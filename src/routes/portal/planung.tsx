import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { listUsers, bootstrapMe } from "@/lib/server/api";
import { assignWorkDay, deleteWorkPlan, getWorkPlan, importCityPlan, listWorkPlans, searchPlaces, streetsInZone } from "@/lib/server/plan-api";
import { deleteTerritory, listTerritories } from "@/lib/server/field-api";
import { FieldMap, type WalkStop } from "@/components/field-map";
import { bboxAround, bboxFromPoints, DEFAULT_STREETS_PER_DAY } from "@/lib/geo-de";
import { can } from "@/lib/e1";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/planung")({ component: Page });

type Place = Awaited<ReturnType<typeof searchPlaces>>[number];

function Page() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Place[]>([]);
  const [place, setPlace] = useState<Place | null>(null);
  const [km, setKm] = useState(2.2);
  const [perDay, setPerDay] = useState(DEFAULT_STREETS_PER_DAY);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [users, setUsers] = useState<Awaited<ReturnType<typeof listUsers>>>([]);
  const [plans, setPlans] = useState<Awaited<ReturnType<typeof listWorkPlans>>>([]);
  const [ters, setTers] = useState<Awaited<ReturnType<typeof listTerritories>>>([]);
  const [open, setOpen] = useState<Awaited<ReturnType<typeof getWorkPlan>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [corners, setCorners] = useState<{ lat: number; lng: number }[]>([]);
  const [walk, setWalk] = useState<WalkStop[]>([]);
  const [walkMeters, setWalkMeters] = useState(0);
  const [groups, setGroups] = useState<Array<{ street: string; houses: string[]; house?: string }>>([]);

  function reload() {
    listWorkPlans().then(setPlans).catch(() => setPlans([]));
    listUsers().then(setUsers).catch(() => setUsers([]));
    listTerritories().then(setTers).catch(() => setTers([]));
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

  if (allowed === null) return <div className="h-40 animate-pulse rounded-3xl bg-surface" />;
  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl bg-surface p-8 gold-hairline">
        <h1 className="font-display text-4xl">Nur Leitung</h1>
        <p className="mt-3 text-sm text-muted">
          Gebiete spielt die Teamleitung auf und weist sie zu. Mitarbeiter sehen ihr Gebiet in der Feld-App.
        </p>
        <Link to="/app" className="mt-4 inline-block text-sm text-gold">
          Zur Feld-App
        </Link>
      </div>
    );
  }

  const box = place ? bboxAround(place.lat, place.lng, km) : null;

  async function loadZone(pts: { lat: number; lng: number }[]) {
    if (pts.length < 3) return;
    setBusy(true);
    try {
      const res = await streetsInZone({ data: { corners: pts } });
      setWalk(
        (res.streets || []).map((s) => ({
          id: s.id,
          street: s.street,
          lat: s.lat,
          lng: s.lng,
          house: s.house,
        })),
      );
      setGroups(res.streets || []);
      setWalkMeters(res.meters);
      toast.success(
        res.houseCount
          ? `${res.streetCount} Straßen · ${res.houseCount} Hausnummern · ${(res.meters / 1000).toFixed(1)} km`
          : `${res.count} Straßen · ${(res.meters / 1000).toFixed(1)} km`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Straßen nicht geladen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl pb-10">
      <p className="text-xs uppercase tracking-[0.2em] text-gold">Feld</p>
      <h1 className="mt-1 font-display text-4xl">Gebietsplanung</h1>
      <p className="mt-2 text-sm text-muted">
        Stadt suchen, Zone mit 3 oder 4 Tipps eingrenzen. Dann werden Straßen und Hausnummern geladen
        und als Laufweg sortiert.
      </p>

      <div className="mt-6 rounded-3xl bg-surface p-5 gold-hairline">
        <Field label="Stadt in Deutschland">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Köln, Berlin Prenzlauer Berg, Leipzig …"
            autoComplete="off"
          />
        </Field>
        {hits.length ? (
          <ul className="mt-2 overflow-hidden rounded-2xl border border-line">
            {hits.map((h) => (
              <li key={`${h.name}-${h.lat}`}>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center justify-between px-4 text-left hover:bg-elevated"
                  onClick={() => {
                    setPlace(h);
                    setQ(h.display || h.name);
                    setHits([]);
                    setCorners([]);
                    setWalk([]);
                    setGroups([]);
                  }}
                >
                  <span>
                    {h.name}
                    <span className="text-muted"> · {h.state}</span>
                  </span>
                  <span className="text-[10px] uppercase tracking-widest text-muted">{h.source === "liste" ? "Stamm" : "OSM"}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {place ? (
          <div className="mt-4 grid gap-3">
            <p className="text-sm">
              Karte: <span className="text-gold">{place.name}</span> · 3 Tipps = Dreieck, 4 Tipps = Rechteck
            </p>
            <FieldMap
              center={{ lat: place.lat, lng: place.lng }}
              corners={corners}
              stops={walk}
              draw
              onTap={async (p) => {
                if (busy) return;
                const next = [...corners, p].slice(0, 4);
                setCorners(next);
                if (next.length >= 3) await loadZone(next);
              }}
            />
            {groups.length ? (
              <ol className="max-h-72 overflow-auto rounded-2xl bg-elevated p-3 text-sm">
                {groups.map((s, i) => (
                  <li key={`${s.street}-${i}`} className="flex gap-2 border-b border-line/60 py-2 last:border-0">
                    <span className="w-6 shrink-0 text-gold">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="font-medium">{s.street}</p>
                      <p className="text-xs leading-relaxed text-muted">
                        {s.houses?.length ? s.houses.join(" · ") : s.house || "ohne Hausnummern"}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCorners([]);
                  setWalk([]);
                  setGroups([]);
                  setWalkMeters(0);
                }}
              >
                Zone löschen
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy || corners.length < 3}
                onClick={() => void loadZone(corners)}
              >
                {busy ? "Lädt OSM…" : "Straßen & Hausnummern laden"}
              </Button>
              <span className="self-center text-xs text-muted">
                {groups.length
                  ? `${groups.length} Straßen · ${groups.reduce((n, g) => n + (g.houses?.length || 0), 0)} Nr. · ${(walkMeters / 1000).toFixed(1)} km`
                  : busy
                    ? "OpenStreetMap…"
                    : corners.length
                      ? `${corners.length}/4 Ecken`
                      : ""}
              </span>
            </div>
            <Field label="Radius in km" hint="Großstadt: Stadtteil suchen oder Radius klein halten.">
              <Input type="number" min={1} max={5} step={0.2} value={km} onChange={(e) => setKm(Number(e.target.value))} />
            </Field>
            <Field label="Straßen pro Arbeitstag">
              <Input type="number" min={8} max={80} value={perDay} onChange={(e) => setPerDay(Number(e.target.value))} />
            </Field>
            <Field label="Aufteilen auf">
              <div className="grid gap-2">
                {users
                  .filter((u) => ["super_admin", "gebietsleiter", "teamleiter", "vertrieb"].includes(u.role))
                  .map((u) => {
                    const on = userIds.includes(u.user_id);
                    return (
                      <label key={u.user_id} className="flex min-h-11 items-center gap-3 rounded-xl bg-elevated px-3 text-sm">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setUserIds((prev) => (on ? prev.filter((id) => id !== u.user_id) : [...prev, u.user_id]))
                          }
                        />
                        {u.first_name} {u.last_name}
                      </label>
                    );
                  })}
              </div>
            </Field>
            <Button
              disabled={busy}
              onClick={async () => {
                if (!place || !box) return;
                setBusy(true);
                try {
                  const drawn = corners.length >= 3 ? bboxFromPoints(corners) : box;
                  const res = await importCityPlan({
                    data: {
                      name: `${place.name} ${km} km`,
                      city: place.name,
                      state: place.state,
                      lat: place.lat,
                      lng: place.lng,
                      ...drawn,
                      perDay,
                      userIds,
                      corners: corners.length >= 3 ? corners : undefined,
                    },
                  });
                  toast.success(
                    `${res.houses || res.streets} Adressen, ${res.days} Tage`,
                  );
                  reload();
                  const detail = await getWorkPlan({ data: { id: res.planId } });
                  setOpen(detail);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Import fehlgeschlagen");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Spielt Adressen ein…" : "Zone einspielen und Plan erzeugen"}
            </Button>
          </div>
        ) : null}
      </div>

      <h2 className="mt-10 font-display text-2xl">Pläne</h2>
      <div className="mt-3 grid gap-2">
        {plans.map((p) => (
          <div key={p.id} className="flex items-stretch gap-2">
            <button
              type="button"
              className="min-w-0 flex-1 rounded-2xl bg-surface p-4 text-left gold-hairline"
              onClick={async () => setOpen(await getWorkPlan({ data: { id: p.id } }))}
            >
              <p className="font-medium">{p.territory_name || p.city}</p>
              <p className="text-xs text-muted">
                {p.city} · {p.days} Tage · {p.per_day} Straßen/Tag
              </p>
            </button>
            <Button
              variant="outline"
              className="shrink-0 text-danger"
              onClick={async () => {
                if (!window.confirm(`${p.territory_name || p.city} wirklich löschen?`)) return;
                try {
                  await deleteWorkPlan({ data: { id: p.id } });
                  toast.success("Gebiet gelöscht");
                  if (open?.id === p.id) setOpen(null);
                  reload();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Löschen fehlgeschlagen");
                }
              }}
            >
              Löschen
            </Button>
          </div>
        ))}
        {plans.length === 0 ? <p className="text-sm text-muted">Noch kein Plan. Oben eine Stadt suchen.</p> : null}
      </div>

      {ters.length ? (
        <>
          <h2 className="mt-10 font-display text-2xl">Gebiete</h2>
          <div className="mt-3 grid gap-2">
            {ters.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-4 gold-hairline">
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted">
                    {t.advisor || "nicht zugewiesen"} · {t.door_count} Adressen
                    {t.active ? "" : " · inaktiv"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="text-danger"
                  onClick={async () => {
                    if (!window.confirm(`${t.name} löschen?`)) return;
                    try {
                      await deleteTerritory({ data: { id: t.id } });
                      toast.success("Gebiet gelöscht");
                      reload();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Löschen fehlgeschlagen");
                    }
                  }}
                >
                  Löschen
                </Button>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {open ? (
        <div className="mt-8">
          <h2 className="font-display text-2xl">
            {open.city} · {open.days.length} Tage
          </h2>
          <Link to="/portal/feld" className="mt-1 inline-block text-sm text-gold">
            Auf der Feldkarte öffnen
          </Link>
          <ol className="mt-4 grid gap-2">
            {open.days.map((d) => (
              <li key={d.id} className="rounded-2xl bg-surface p-4 gold-hairline">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    Tag {d.day} · {d.stop_count} Straßen · {(d.meters / 1000).toFixed(1)} km
                  </p>
                  <Select
                    value={d.user_id}
                    onChange={async (e) => {
                      await assignWorkDay({ data: { dayId: d.id, userId: e.target.value } });
                      toast.success("Zugewiesen");
                      setOpen(await getWorkPlan({ data: { id: open.id } }));
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
                <p className="mt-1 text-xs text-muted">{d.advisor || "nicht zugewiesen"}</p>
                <p className="mt-2 text-sm text-muted">
                  {d.stops
                    .slice(0, 8)
                    .map((s) => s.street)
                    .join(" · ")}
                  {d.stops.length > 8 ? " …" : ""}
                </p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
