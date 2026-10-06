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

  // Planen
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
      )}
    </div>
  );
}
