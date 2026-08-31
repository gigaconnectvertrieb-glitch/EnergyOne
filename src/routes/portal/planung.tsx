import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { listUsers } from "@/lib/server/api";
import { assignWorkDay, getWorkPlan, importCityPlan, listWorkPlans, searchPlaces } from "@/lib/server/plan-api";
import { bboxAround, DEFAULT_STREETS_PER_DAY } from "@/lib/geo-de";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/planung")({ component: Page });

type Place = Awaited<ReturnType<typeof searchPlaces>>[number];

function Page() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Place[]>([]);
  const [place, setPlace] = useState<Place | null>(null);
  const [km, setKm] = useState(2.2);
  const [perDay, setPerDay] = useState(DEFAULT_STREETS_PER_DAY);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [users, setUsers] = useState<Awaited<ReturnType<typeof listUsers>>>([]);
  const [plans, setPlans] = useState<Awaited<ReturnType<typeof listWorkPlans>>>([]);
  const [open, setOpen] = useState<Awaited<ReturnType<typeof getWorkPlan>> | null>(null);
  const [busy, setBusy] = useState(false);

  function reload() {
    listWorkPlans().then(setPlans).catch(() => setPlans([]));
    listUsers().then(setUsers).catch(() => setUsers([]));
  }
  useEffect(reload, []);

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

  const box = place ? bboxAround(place.lat, place.lng, km) : null;

  return (
    <div className="mx-auto max-w-3xl pb-10">
      <p className="text-xs uppercase tracking-[0.2em] text-gold">Feld</p>
      <h1 className="mt-1 font-display text-4xl">Gebietsplanung</h1>
      <p className="mt-2 text-sm text-muted">
        Stadt suchen, Straßen einspielen, Tagesrouten erzeugen. Am Anfang Orhan und Luca Marco — später jeder Mitarbeiter deutschlandweit.
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
              Markiert: <span className="text-gold">{place.name}</span> · {place.state}
            </p>
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
                  const res = await importCityPlan({
                    data: {
                      name: `${place.name} ${km} km`,
                      city: place.name,
                      state: place.state,
                      lat: place.lat,
                      lng: place.lng,
                      ...box,
                      perDay,
                      userIds,
                    },
                  });
                  toast.success(`${res.streets} Straßen, ${res.days} Tage`);
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
              {busy ? "Spielt Straßen ein…" : "Straßen einspielen und Plan erzeugen"}
            </Button>
          </div>
        ) : null}
      </div>

      <h2 className="mt-10 font-display text-2xl">Pläne</h2>
      <div className="mt-3 grid gap-2">
        {plans.map((p) => (
          <button
            key={p.id}
            type="button"
            className="rounded-2xl bg-surface p-4 text-left gold-hairline"
            onClick={async () => setOpen(await getWorkPlan({ data: { id: p.id } }))}
          >
            <p className="font-medium">{p.territory_name || p.city}</p>
            <p className="text-xs text-muted">
              {p.city} · {p.days} Tage · {p.per_day} Straßen/Tag
            </p>
          </button>
        ))}
        {plans.length === 0 ? <p className="text-sm text-muted">Noch kein Plan. Oben eine Stadt suchen.</p> : null}
      </div>

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
