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
        </div>
      )}
    </div>
  );
}
