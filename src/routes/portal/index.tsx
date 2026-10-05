/**
 * E1 Portal – Dashboard „Heute“
 * -----------------------------
 * Einheitlich für Feld + Büro.
 * Tour, Gebiet, offene Nachläufe, schnelle Aktionen, eigene Zahlen.
 * Leitung sieht zusätzlich Agentur-KPIs.
 *
 * Ersetzt: src/routes/portal/index.tsx
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getDashboard } from "@/lib/server/api";
import { downloadMyTerritory, getFieldHome, fieldBalance } from "@/lib/server/field-api";
import { can, STATUS_LABELS, type ContractStatus } from "@/lib/e1";
import { eur } from "@/lib/utils";
import { vatOn } from "@/lib/steuer";
import { StatusBadge } from "@/components/status-badge";
import { GoalCard } from "@/components/goal-card";
import { WorkShift } from "@/components/work-shift";
import { PushEnable } from "@/components/push-enable";
import { toast } from "sonner";
import {
  Map,
  Plus,
  ClipboardList,
  Users,
  ChevronRight,
  Download,
  AlertCircle,
} from "lucide-react";

export const Route = createFileRoute("/portal/")({ component: Heute });

function Heute() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getDashboard>> | null>(null);
  const [field, setField] = useState<Awaited<ReturnType<typeof getFieldHome>> | null>(null);
  const [bal, setBal] = useState<Awaited<ReturnType<typeof fieldBalance>> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Fehler"));
    getFieldHome()
      .then(setField)
      .catch(() => setField(null));
    fieldBalance()
      .then(setBal)
      .catch(() => setBal(null));
  }, []);

  if (err) return <p className="text-danger">{err}</p>;
  if (!data) {
    return <div className="h-48 animate-pulse rounded-3xl bg-surface" />;
  }

  const hour = new Date().getHours();
  const hi = hour < 11 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend";
  const isLead =
    data.me.role === "super_admin" ||
    data.me.role === "buchhaltung" ||
    data.me.role === "gebietsleiter";

  const openFollowups = field?.openFollowups ?? 0;
  const territoryName = field?.pending?.name || field?.territory?.name || null;
  const hasPendingTerritory = Boolean(field?.pending);

  return (
    <div className="mx-auto max-w-3xl">
      {/* Begrüßung */}
      <p className="text-[11px] uppercase tracking-[0.22em] text-gold">Heute</p>
      <h1 className="mt-1 font-display text-4xl leading-none">{hi}</h1>
      <p className="mt-2 text-sm text-muted">
        {data.me.first_name}
        {data.me.role === "vertrieb" || data.me.role === "partner"
          ? ` · Stufe ${data.me.commission_stufe || 1}`
          : data.me.role === "super_admin"
            ? " · Leitung"
            : ""}
      </p>

      {/* Schicht + Push */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 gold-hairline">
          <span className="text-sm text-muted">Schicht</span>
          <WorkShift />
        </div>
        <PushEnable />
      </div>

      {/* Gebiet / Tour */}
      <section className="mt-5 rounded-3xl bg-surface p-5 gold-hairline">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-gold">Gebiet & Tour</p>
            {hasPendingTerritory ? (
              <>
                <p className="mt-2 font-medium">Neues Gebiet bereit</p>
                <p className="text-sm text-muted">{field?.pending?.name}</p>
              </>
            ) : territoryName ? (
              <>
                <p className="mt-2 font-medium">{territoryName}</p>
                <p className="text-sm text-muted">
                  {field?.week ? `Woche ${field.week}` : "Aktives Gebiet"}
                  {openFollowups > 0 ? ` · ${openFollowups} Nachläufe` : ""}
                </p>
              </>
            ) : (
              <>
                <p className="mt-2 font-medium text-muted">Kein Gebiet zugewiesen</p>
                <p className="text-sm text-muted">
                  Orhan oder die Leitung spielt Straßen auf.
                </p>
              </>
            )}
          </div>
          <Map className="size-5 shrink-0 text-gold/80" />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {hasPendingTerritory || territoryName ? (
            <Link
              to="/portal/gebiete"
              className="inline-flex items-center gap-2 rounded-xl bg-gold px-4 py-2.5 text-sm font-medium text-bg"
            >
              <Map className="size-4" />
              Tour öffnen
            </Link>
          ) : null}
          {territoryName ? (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm gold-hairline"
              onClick={async () => {
                try {
                  const file = await downloadMyTerritory();
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(
                    new Blob([file.json], { type: "application/geo+json" }),
                  );
                  a.download = file.filename;
                  a.click();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Kein Gebiet");
                }
              }}
            >
              <Download className="size-4" />
              Offline laden
            </button>
          ) : null}
          {can(data.me.role, "team.view") ? (
            <Link
              to="/portal/gebiete"
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm gold-hairline"
            >
              Gebiete aufspielen
            </Link>
          ) : null}
        </div>
      </section>

      {/* Offene Nachläufe */}
      {openFollowups > 0 ? (
        <Link
          to="/portal/auftraege"
          search={{ filter: "nachlauf" } as never}
          className="mt-4 flex items-center gap-3 rounded-2xl border border-warn/30 bg-warn/5 px-4 py-3.5"
        >
          <AlertCircle className="size-5 shrink-0 text-warn" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {openFollowups} offene Nachläufe
            </p>
            <p className="text-xs text-muted">Kunden erneut ansprechen</p>
          </div>
          <ChevronRight className="size-4 text-muted" />
        </Link>
      ) : null}

      {/* Schnellaktionen – Vertragseingabe vorerst ausgeblendet */}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Link
          to="/portal/auftraege"
          className="flex flex-col items-center gap-2 rounded-2xl bg-surface px-3 py-4 text-center gold-hairline"
        >
          <ClipboardList className="size-5 text-gold" />
          <span className="text-xs font-medium">Aufträge</span>
        </Link>
        <Link
          to="/portal/kunden"
          className="flex flex-col items-center gap-2 rounded-2xl bg-surface px-3 py-4 text-center gold-hairline"
        >
          <Users className="size-5 text-gold" />
          <span className="text-xs font-medium">Kunden</span>
        </Link>
      </div>

      {/* Eigene Zahlen */}
      <section className="mt-5">
        <p className="mb-3 text-[11px] uppercase tracking-[0.16em] text-muted">
          Deine Zahlen
        </p>
        <div className="grid grid-cols-3 gap-2">
          <Stat
            label="Heute"
            value={bal ? eur(bal.tag.eur) : eur(0)}
            sub={bal ? `${bal.tag.n} Abschluss` : "—"}
          />
          <Stat
            label="Woche"
            value={bal ? eur(bal.woche.eur) : eur(0)}
            sub={bal ? `${bal.woche.n}` : "—"}
          />
          <Stat
            label="Monat"
            value={bal ? eur(bal.monat.eur) : eur(data.myTurnover || 0)}
            sub={
              bal
                ? `${bal.monat.n}`
                : `${data.monthWon} / Ziel ${data.target}`
            }
          />
        </div>
      </section>

      {/* Ziel */}
      <div className="mt-5">
        <GoalCard />
      </div>

      {/* Pipeline kompakt */}
      <section className="mt-5 rounded-3xl bg-surface p-5 gold-hairline">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium">Pipeline</p>
          <Link to="/portal/auftraege" className="text-xs text-gold">
            Alle →
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(data.pipeline) as ContractStatus[]).map((s) => {
            const n = data.pipeline[s];
            if (!n) return null;
            return (
              <Link
                key={s}
                to="/portal/auftraege"
                className="flex items-center gap-2 rounded-full bg-elevated px-3 py-1.5 text-xs"
              >
                <StatusBadge status={s} />
                <span className="tabular-nums text-muted">{n}</span>
              </Link>
            );
          })}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted">Neue Aufträge Monat</p>
            <p className="mt-0.5 font-display text-2xl tabular-nums">{data.monthCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Provision offen</p>
            <p className="mt-0.5 font-display text-2xl tabular-nums">
              {eur(data.commissionOpen)}
            </p>
            <p className="text-[10px] text-muted">
              frei {eur(data.commissionApproved)}
            </p>
          </div>
        </div>
      </section>

      {/* Leitung: Agentur (Stufe 13) */}
      {isLead ? (
        <section className="mt-5 rounded-3xl bg-surface p-5 gold-hairline">
          <p className="text-[11px] uppercase tracking-[0.16em] text-gold">
            Agentur · Stufe 13
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Kpi
              label="New Sales brutto"
              value={eur(data.agencyGross || 0)}
              hint={`netto ${eur(vatOn(data.agencyGross || 0).net)}`}
            />
            <Kpi
              label="An Mitarbeiter"
              value={eur(data.agencyAdvisor || 0)}
              hint="deren Stufen 1–3"
            />
            <Kpi
              label="E1-Marge"
              value={eur(data.agencyMargin || 0)}
              hint={`abzgl. Fix ${eur(data.agencyFix || 0)}`}
            />
          </div>
        </section>
      ) : null}

      {/* Ranking (wenn Team sichtbar) */}
      {data.ranking?.length > 0 && can(data.me.role, "team.view") ? (
        <section className="mt-5 rounded-3xl bg-surface p-5 gold-hairline">
          <p className="mb-3 text-sm font-medium">Ranking Monat</p>
          <ol className="space-y-2">
            {data.ranking.slice(0, 8).map((r, i) => (
              <li
                key={r.user_id}
                className="flex items-center justify-between text-sm"
              >
                <span>
                  <span className="mr-2 text-gold">{i + 1}.</span>
                  {r.name}
                </span>
                <span className="tabular-nums text-muted">
                  {r.wins}/{r.target || "–"}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl bg-surface p-3 gold-hairline">
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-1 font-display text-xl tabular-nums leading-none">{value}</p>
      <p className="mt-1 text-[10px] text-muted">{sub}</p>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl tabular-nums">{value}</p>
      <p className="text-[10px] text-muted">{hint}</p>
    </div>
  );
}
