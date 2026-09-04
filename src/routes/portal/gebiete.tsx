import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { listUsers, bootstrapMe } from "@/lib/server/api";
import { assignWorkDay, deleteWorkPlan, getWorkPlan, importCityPlan, listWorkPlans, searchPlaces, streetsInZone } from "@/lib/server/plan-api";
import { approveTerritoryRequest, assignTerritory, deleteTerritory, downloadTerritory, listTerritories, listTerritoryRequests } from "@/lib/server/field-api";
import { FieldMap } from "@/components/field-map";
import { bboxAround, bboxFromPoints } from "@/lib/geo-de";
import { can } from "@/lib/e1";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/gebiete")({ component: Page });

type Place = Awaited<ReturnType<typeof searchPlaces>>[number];

function downloadText(filename: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
}

async function pullTerritoryFile(id: string) {
  const file = await downloadTerritory({ data: { id } });
  downloadText(`${file.filename}.csv`, file.csv, "text/csv;charset=utf-8");
  downloadText(`${file.filename}.geojson`, file.geojson, "application/geo+json");
  return file;
}

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
      setGroups(res.streets || []);
      toast.success(
        res.houseCount
          ? `${res.streetCount} Straßen · ${res.houseCount} Hausnummern`
          : `${res.count} Straßen`,
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
      <h1 className="mt-1 font-display text-4xl">Gebiete</h1>
      <p className="mt-2 text-sm text-muted">
        Luca und Orhan können hier beides. Orhan führt die Gebiete im Alltag. Die Laufliste in der App zeigt jedes Haus plus letzten Besuch.
      </p>
      <Requests />

      <div className="mt-6 rounded-3xl bg-surface p-5 gold-hairline">
        <Field label="PLZ oder Stadt">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="68649 oder Köln Nippes"
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
              Satellit: <span className="text-gold">{place.name}</span> · nur Zone einzeichnen, keine Punkte
            </p>
            <FieldMap
              center={{ lat: place.lat, lng: place.lng }}
              corners={corners}
              draw
              onTap={(p) => {
                setCorners((prev) => (prev.length >= 4 ? prev : [...prev, p]));
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
                  setGroups([]);
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
                {busy ? "Lädt OSM…" : "Straßen der Zone listen"}
              </Button>
              <span className="self-center text-xs text-muted">
                {groups.length
                  ? `${groups.length} Straßen · ${groups.reduce((n, g) => n + (g.houses?.length || 0), 0)} Hausnummern`
                  : busy
                    ? "OpenStreetMap…"
                    : corners.length
                      ? `${corners.length}/4 Ecken`
                      : ""}
              </span>
            </div>
            <Field label="Nur Kern begrenzen (km)" hint="Großstadt besser als Stadtteil suchen, z. B. Köln Nippes.">
              <Input type="number" min={1} max={8} step={0.2} value={km} onChange={(e) => setKm(Number(e.target.value))} />
            </Field>
            <Field label="Zuweisen an">
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
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                disabled={busy}
                onClick={async () => {
                  if (!place) return;
                  if (!userIds.length) {
                    toast.error("Erst den Mitarbeiter anhaken, dann aufspielen.");
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
                    const res = await importCityPlan({
                      data: {
                        name: place.name,
                        city: place.name,
                        state: place.state,
                        lat: place.lat,
                        lng: place.lng,
                        ...cityBox,
                        userIds,
                        full: false,
                        zip: /^\d{5}/.test(place.name) ? place.name.slice(0, 5) : /^\d{5}$/.test(q.trim()) ? q.trim() : undefined,
                      },
                    });
                    toast.success(
                      res.houses || res.streets
                        ? `${res.houses || res.streets} Adressen aufgespielt`
                        : "Gebiet zugewiesen. Straßen nachladen, wenn OSM wieder antwortet.",
                    );
                    if (res.territoryId) await pullTerritoryFile(res.territoryId);
                    reload();
                    const detail = await getWorkPlan({ data: { id: res.planId } });
                    setOpen(detail);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Aufspielen fehlgeschlagen");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Spielt auf…" : "Gebiet aufspielen"}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  if (!place || !box) return;
                  setBusy(true);
                  try {
                    const drawn = corners.length >= 3 ? bboxFromPoints(corners) : box;
                    const res = await importCityPlan({
                      data: {
                        name: `${place.name} Zone`,
                        city: place.name,
                        state: place.state,
                        lat: place.lat,
                        lng: place.lng,
                        ...drawn,
                        userIds,
                        corners: corners.length >= 3 ? corners : undefined,
                      },
                    });
                    toast.success(`${res.houses || res.streets} Adressen geloggt`);
                    if (res.territoryId) await pullTerritoryFile(res.territoryId);
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
                {busy ? "Speichert…" : userIds.length ? "Zone aufspielen" : "Nur Zone speichern"}
              </Button>
            </div>
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
                {p.city} · {p.days} Tage · gespeichert
              </p>
            </button>
            <Button
              variant="outline"
              className="shrink-0"
              onClick={async () => {
                if (!p.territory_id) return;
                try {
                  const file = await pullTerritoryFile(p.territory_id);
                  toast.success(`${file.count} Straßen heruntergeladen`);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Download fehlgeschlagen");
                }
              }}
            >
              Download
            </Button>
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
              <div key={t.id} className="rounded-2xl bg-surface p-4 gold-hairline">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-muted">
                      {t.advisor || "nicht zugewiesen"} · {t.door_count} Adressen geloggt
                      {t.active ? "" : " · inaktiv"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={t.user_id}
                      onChange={async (e) => {
                        const userId = e.target.value;
                        if (!userId) return;
                        try {
                          await assignTerritory({ data: { id: t.id, userId } });
                          toast.success("Dem Mitarbeiter aufgespielt");
                          reload();
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Zuweisen fehlgeschlagen");
                        }
                      }}
                    >
                      <option value="">Mitarbeiter wählen</option>
                      {users
                        .filter((u) => ["super_admin", "gebietsleiter", "teamleiter", "vertrieb"].includes(u.role))
                        .map((u) => (
                          <option key={u.user_id} value={u.user_id}>
                            {u.first_name} {u.last_name}
                          </option>
                        ))}
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          const file = await pullTerritoryFile(t.id);
                          toast.success(`${file.count} Straßen heruntergeladen`);
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Download fehlgeschlagen");
                        }
                      }}
                    >
                      Download
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
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
                </div>
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
          <Link to="/app" className="mt-1 inline-block text-sm text-gold">
            In der Feld-App ansehen
          </Link>
          <ol className="mt-4 grid gap-2">
            {open.days.map((d) => (
              <li key={d.id} className="rounded-2xl bg-surface p-4 gold-hairline">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {d.stop_count} Straßen
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
                <ol className="mt-3 max-h-80 overflow-auto text-sm">
                  {d.stops.map((s) => (
                    <li key={s.id} className="border-b border-line/50 py-1.5 last:border-0">
                      {s.street}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

function Requests() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listTerritoryRequests>>>([]);
  function load() {
    listTerritoryRequests().then(setRows).catch(() => setRows([]));
  }
  useEffect(load, []);
  if (!rows.length) return null;
  return (
    <div className="mt-6 rounded-3xl bg-surface p-5 gold-hairline">
      <p className="text-xs uppercase tracking-[0.16em] text-gold">Freigabe angefragt</p>
      <ul className="mt-3 grid gap-2">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
            <span>
              {r.name} · {r.label}
            </span>
            <Button
              onClick={async () => {
                try {
                  await approveTerritoryRequest({ data: { id: r.id } });
                  toast.success("Freigegeben. Mitarbeiter kann herunterladen.");
                  load();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Nicht frei");
                }
              }}
            >
              Freigeben
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
