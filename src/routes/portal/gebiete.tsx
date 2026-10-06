/**
 * E1 Gebietsplanung – professionell für Leitung (Orhan + Luca)
 * -----------------------------------------------------------
 * Ort suchen · Zone festlegen · Straßen laden · Mitarbeiter zuweisen · Übersicht
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
import { StreetManager } from "@/components/street-manager";
import { bboxAround, bboxFromPoints } from "@/lib/geo-de";
import { can } from "@/lib/e1";
import { toast } from "sonner";
import {
  Map,
  Users,
  Download,
  Trash2,
  Plus,
  List,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";

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
  display?: string;
};

type Tab = "uebersicht" | "planen";

function Page() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("uebersicht");

  // Manager
  const [step, setStep] = useState(1);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Place[]>([]);
  const [place, setPlace] = useState<Place | null>(null);
  const [km, setKm] = useState(2.2);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [corners, setCorners] = useState<{ lat: number; lng: number }[]>([]);
  const [groups, setGroups] = useState<
    Array<{ street: string; houses: string[]; house?: string }>
  >([]);
  const [busy, setBusy] = useState(false);

  // Übersicht
  const [users, setUsers] = useState<Awaited<ReturnType<typeof listUsers>>>([]);
  const [plans, setPlans] = useState<Awaited<ReturnType<typeof listWorkPlans>>>([]);
  const [ters, setTers] = useState<Awaited<ReturnType<typeof listTerritories>>>([]);
  const [requests, setRequests] = useState<
    Awaited<ReturnType<typeof listTerritoryRequests>>
  >([]);
  const [open, setOpen] = useState<Awaited<ReturnType<typeof getWorkPlan>> | null>(
    null,
  );

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
        .then((r) => setHits(r as Place[]))
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
          Die Leitung plant und spielt Straßen auf. Unter „Heute“ sehen Sie Ihr
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
    ["super_admin", "gebietsleiter", "teamleiter", "vertrieb", "partner"].includes(
      u.role,
    ),
  );

  function resetPlan() {
    setStep(1);
    setPlace(null);
    setQ("");
    setHits([]);
    setCorners([]);
    setGroups([]);
    setUserIds([]);
    setKm(2.2);
  }

  async function loadZone(pts: { lat: number; lng: number }[]) {
    if (pts.length < 3) {
      toast.error("Mindestens 3 Punkte auf der Karte setzen.");
      return;
    }
    setBusy(true);
    try {
      const res = await streetsInZone({ data: { corners: pts } });
      setGroups(res.streets || []);
      toast.success(
        res.houseCount
          ? `${res.streetCount} Straßen · ${res.houseCount} Hausnummern`
          : `${res.count ?? res.streets?.length ?? 0} Straßen`,
      );
      setStep(3);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Zone laden fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function aufspielen(mode: "city" | "zone") {
    if (!place) return;
    if (!userIds.length) {
      toast.error("Mindestens einen Mitarbeiter wählen.");
      setStep(4);
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
      const drawn =
        corners.length >= 3 ? bboxFromPoints(corners) : box || cityBox;
      const res = await importCityPlan({
        data: {
          name: mode === "city" ? place.name : `${place.name} Zone`,
          city: place.name,
          state: place.state || "",
          lat: place.lat,
          lng: place.lng,
          ...(mode === "city" ? cityBox : drawn),
          userIds,
          full: mode === "city",
          corners: mode === "zone" && corners.length >= 3 ? corners : undefined,
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
        try {
          setOpen(await getWorkPlan({ data: { id: res.planId } }));
        } catch {
          /* */
        }
      }
      resetPlan();
      setTab("uebersicht");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Aufspielen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-gold">
            Steuerung
          </p>
          <h1 className="mt-1 font-display text-4xl">Gebietsplanung</h1>
          <p className="mt-1 text-sm text-muted">
            Orte planen, Straßen zuweisen, Touren steuern
          </p>
        </div>
        {tab === "uebersicht" ? (
          <Button
            type="button"
            onClick={() => {
              resetPlan();
              setTab("planen");
            }}
          >
            <Plus className="mr-1 size-4" />
            Neu planen
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={() => setTab("uebersicht")}>
            Zur Übersicht
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="mt-5 flex gap-2 text-xs">
        <button
          type="button"
          className={`rounded-full px-4 py-2 ${tab === "uebersicht" ? "bg-gold text-bg" : "bg-elevated text-muted"}`}
          onClick={() => setTab("uebersicht")}
        >
          <List className="mr-1 inline size-3.5" />
          Übersicht
        </button>
        <button
          type="button"
          className={`rounded-full px-4 py-2 ${tab === "planen" ? "bg-gold text-bg" : "bg-elevated text-muted"}`}
          onClick={() => setTab("planen")}
        >
          <Map className="mr-1 inline size-3.5" />
          Planen
        </button>
      </div>

      {/* ========== PLANEN ========== */}
      {tab === "planen" && (
        <div className="mt-6">
          <StreetManager />
          {false && (<>{/* Step indicators */}
          <div className="mb-5 flex flex-wrap gap-1">
            {["Ort", "Zone", "Straßen", "Team", "Aufspielen"].map((label, i) => {
              const n = i + 1;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    if (n < step) setStep(n);
                  }}
                  className={`rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.1em] ${
                    n === step
                      ? "bg-gold text-bg"
                      : n < step
                        ? "bg-elevated text-gold"
                        : "text-muted"
                  }`}
                >
                  {n < step ? (
                    <CheckCircle2 className="mr-1 inline size-3" />
                  ) : null}
                  {n} {label}
                </button>
              );
            })}
          </div>

          {/* Step 1: Ort */}
          {step === 1 && (
            <section className="rounded-3xl bg-surface p-5 gold-hairline">
              <p className="text-xs uppercase tracking-[0.16em] text-gold">
                1 · Ort oder PLZ
              </p>
              <Field label="Suche" className="mt-3">
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="z. B. Köln Nippes, 50733, München Schwabing"
                  autoFocus
                />
              </Field>
              {hits.length > 0 && (
                <ul className="mt-2 max-h-56 overflow-y-auto rounded-xl bg-elevated">
                  {hits.map((h, i) => (
                    <li key={`${h.name}-${i}`}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-surface"
                        onClick={() => {
                          setPlace(h);
                          setHits([]);
                          setQ(h.display || h.name);
                          setCorners([]);
                          setGroups([]);
                          setStep(2);
                        }}
                      >
                        <span>
                          {h.display || h.name}
                          {h.state && !String(h.display || "").includes(h.state)
                            ? ` · ${h.state}`
                            : ""}
                        </span>
                        <ChevronRight className="size-4 text-muted" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-muted">
                Stadtteil oder PLZ wählen – danach Zone auf der Karte eingrenzen
                oder ganzen Ort zuweisen.
              </p>
            </section>
          )}

          {/* Step 2: Zone / Karte */}
          {step === 2 && place && (
            <section className="rounded-3xl bg-surface p-5 gold-hairline">
              <p className="text-xs uppercase tracking-[0.16em] text-gold">
                2 · Zone festlegen
              </p>
              <p className="mt-2 font-medium">{place.display || place.name}</p>
              <Field label="Radius begrenzen (km)" className="mt-3">
                <Input
                  type="number"
                  min={0.5}
                  max={10}
                  step={0.2}
                  value={km}
                  onChange={(e) => setKm(Number(e.target.value))}
                />
              </Field>
              <p className="mt-2 text-xs text-muted">
                Optional: auf der Karte tippen und Ecken setzen (mind. 3), um eine
                Zone zu zeichnen.
              </p>
              <div className="mt-4 h-64 overflow-hidden rounded-2xl">
                <FieldMap
                  center={{ lat: place.lat, lng: place.lng }}
                  corners={corners}
                  draw
                  onTap={(p) =>
                    setCorners((prev) =>
                      prev.length >= 8 ? [...prev.slice(1), p] : [...prev, p],
                    )
                  }
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCorners([])}
                  disabled={!corners.length}
                >
                  Ecken löschen ({corners.length})
                </Button>
                <Button
                  type="button"
                  disabled={busy || corners.length < 3}
                  onClick={() => void loadZone(corners)}
                >
                  {busy ? "Lädt Straßen…" : "Straßen der Zone laden"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setGroups([]);
                    setStep(4);
                  }}
                >
                  Ganzen Ort · ohne Zone
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                onClick={() => setStep(1)}
              >
                Anderen Ort
              </Button>
            </section>
          )}

          {/* Step 3: Straßen-Vorschau */}
          {step === 3 && (
            <section className="rounded-3xl bg-surface p-5 gold-hairline">
              <p className="text-xs uppercase tracking-[0.16em] text-gold">
                3 · Straßen
              </p>
              <p className="mt-2 text-sm">
                <span className="font-medium tabular-nums">{groups.length}</span>{" "}
                Straßen ·{" "}
                <span className="font-medium tabular-nums">
                  {groups.reduce((n, g) => n + (g.houses?.length || 0), 0)}
                </span>{" "}
                Hausnummern
              </p>
              <ul className="mt-3 max-h-48 overflow-y-auto rounded-xl bg-elevated text-sm">
                {groups.slice(0, 40).map((g, i) => (
                  <li
                    key={`${g.street}-${i}`}
                    className="border-b border-line/50 px-3 py-2 last:border-0"
                  >
                    {g.street}
                    {g.houses?.length ? (
                      <span className="text-muted">
                        {" "}
                        · {g.houses.length} Nr.
                      </span>
                    ) : null}
                  </li>
                ))}
                {groups.length > 40 && (
                  <li className="px-3 py-2 text-xs text-muted">
                    … und {groups.length - 40} weitere
                  </li>
                )}
              </ul>
              <div className="mt-4 flex gap-2">
                <Button type="button" variant="outline" onClick={() => setStep(2)}>
                  Zone anpassen
                </Button>
                <Button type="button" onClick={() => setStep(4)}>
                  Weiter · Team
                </Button>
              </div>
            </section>
          )}

          {/* Step 4: Team */}
          {step === 4 && (
            <section className="rounded-3xl bg-surface p-5 gold-hairline">
              <p className="text-xs uppercase tracking-[0.16em] text-gold">
                4 · Mitarbeiter
              </p>
              <p className="mt-2 text-sm text-muted">
                Gebiet:{" "}
                <span className="text-ink">{place?.display || place?.name}</span>
                {groups.length
                  ? ` · ${groups.length} Straßen`
                  : " · gesamter Ort"}
              </p>
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
                            on
                              ? prev.filter((id) => id !== u.user_id)
                              : [...prev, u.user_id],
                          )
                        }
                      />
                      {u.first_name} {u.last_name}
                      <span className="ml-auto text-xs text-muted">
                        {u.staff_id || u.role}
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="mt-4 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(groups.length ? 3 : 2)}
                >
                  Zurück
                </Button>
                <Button
                  type="button"
                  disabled={!userIds.length}
                  onClick={() => setStep(5)}
                >
                  Weiter · Aufspielen
                </Button>
              </div>
            </section>
          )}

          {/* Step 5: Aufspielen */}
          {step === 5 && place && (
            <section className="rounded-3xl bg-surface p-5 gold-hairline">
              <p className="text-xs uppercase tracking-[0.16em] text-gold">
                5 · Aufspielen
              </p>
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Ort</dt>
                  <dd className="text-right font-medium">
                    {place.display || place.name}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Umfang</dt>
                  <dd className="text-right">
                    {groups.length
                      ? `${groups.length} Straßen (Zone)`
                      : "Gesamter Ort"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Mitarbeiter</dt>
                  <dd className="text-right">{userIds.length}</dd>
                </div>
              </dl>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <Button
                  disabled={busy || !userIds.length}
                  onClick={() => void aufspielen("city")}
                >
                  {busy ? "Spielt auf…" : "Gesamten Ort aufspielen"}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || !userIds.length}
                  onClick={() => void aufspielen("zone")}
                >
                  {busy ? "Spielt auf…" : "Nur Zone aufspielen"}
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted">
                Mitarbeiter erhalten Push und sehen das Gebiet unter „Heute“ /
                Tour.
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                onClick={() => setStep(4)}
              >
                Team ändern
              </Button>
            </section>
          )}
        </div>
      )}

      {/* ========== ÜBERSICHT ========== */}
      {tab === "uebersicht" && (
        <div className="mt-6 space-y-8">
          {/* Anfragen */}
          {requests.length > 0 && (
            <section>
              <p className="text-sm font-medium">Offene Anfragen</p>
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
                          toast.error(
                            e instanceof Error ? e.message : "Fehler",
                          );
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

          {/* Gebiete */}
          <section>
            <p className="text-sm font-medium">Zugewiesene Gebiete</p>
            <ul className="mt-2 space-y-2">
              {ters.length === 0 && (
                <li className="rounded-2xl bg-surface p-6 text-center text-sm text-muted gold-hairline">
                  Noch keine Gebiete.{" "}
                  <button
                    type="button"
                    className="text-gold"
                    onClick={() => setTab("planen")}
                  >
                    Jetzt planen
                  </button>
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
                        {t.advisor || "nicht zugewiesen"} ·{" "}
                        {t.door_count ?? 0} Adressen
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
                            await assignTerritory({
                              data: { id: t.id, userId },
                            });
                            toast.success("Zugewiesen");
                            reload();
                          } catch (err) {
                            toast.error(
                              err instanceof Error
                                ? err.message
                                : "Zuweisen fehlgeschlagen",
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
                            const file = await downloadTerritory({
                              data: { id: t.id },
                            });
                            const a = document.createElement("a");
                            a.href = URL.createObjectURL(
                              new Blob([file.json], {
                                type: "application/geo+json",
                              }),
                            );
                            a.download =
                              file.filename || `${t.name}.geojson`;
                            a.click();
                          } catch (e) {
                            toast.error(
                              e instanceof Error
                                ? e.message
                                : "Download fehlgeschlagen",
                            );
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
                          if (!confirm(`Gebiet „${t.name}“ löschen?`)) return;
                          try {
                            await deleteTerritory({ data: { id: t.id } });
                            toast.success("Gelöscht");
                            reload();
                          } catch (e) {
                            toast.error(
                              e instanceof Error
                                ? e.message
                                : "Löschen fehlgeschlagen",
                            );
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
            <section>
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
                          toast.error(
                            e instanceof Error
                              ? e.message
                              : "Laden fehlgeschlagen",
                          );
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
            <section className="rounded-3xl bg-surface p-5 gold-hairline">
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
                {(open.days || []).map(
                  (d: { id: string; label?: string; user_id?: string }) => (
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
                            setOpen(
                              await getWorkPlan({ data: { id: open.id } }),
                            );
                          } catch (err) {
                            toast.error(
                              err instanceof Error ? err.message : "Fehler",
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
                    </li>
                  ),
                )}
              </ul>
            </section>
          )}
        </div>
          </>)}
      )}
    </div>
  );
}
