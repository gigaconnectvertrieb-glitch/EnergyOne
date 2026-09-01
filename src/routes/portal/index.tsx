import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getDashboard } from "@/lib/server/api";
import { downloadMyTerritory, getFieldHome } from "@/lib/server/field-api";
import { STATUS_LABELS, type ContractStatus } from "@/lib/e1";
import { eur } from "@/lib/utils";
import { vatOn } from "@/lib/steuer";
import { StatusBadge } from "@/components/status-badge";
import { AuthChip } from "@/components/mail-status";
import { GoalCard } from "@/components/goal-card";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/")({ component: Dashboard });

function Dashboard() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getDashboard>> | null>(null);
  const [field, setField] = useState<Awaited<ReturnType<typeof getFieldHome>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Fehler"));
    getFieldHome().then(setField).catch(() => setField(null));
  }, []);
  if (err) return <p className="text-danger">{err}</p>;
  if (!data) return <div className="h-48 animate-pulse rounded-3xl bg-surface" />;

  const pipe = Object.entries(data.pipeline).map(([k, v]) => ({
    name: STATUS_LABELS[k as ContractStatus] ?? k,
    n: v,
  }));

  return (
    <div>
      <p className="text-xs uppercase tracking-[0.22em] text-gold">Willkommen zurück</p>
      <h1 className="mt-1 font-display text-4xl">
        {data.me.first_name}, hier ist Ihr Stand.
      </h1>
      {data.mail && !data.mail.ready ? (
        <Link
          to="/portal/admin/mail"
          className="mt-6 flex flex-col gap-2 rounded-3xl bg-surface p-5 gold-hairline"
        >
          <p className="text-xs uppercase tracking-[0.16em] text-warn">E-Mail-Sicherheit</p>
          <p className="font-medium">Versand als @e1direktvertrieb.de ist gesperrt.</p>
          <p className="text-sm text-muted">{data.mail.block_reason}</p>
          <div className="mt-1 flex flex-wrap gap-2">
            <span className="flex items-center gap-2 text-xs text-muted">
              SPF <AuthChip state={data.mail.spf} />
            </span>
            <span className="flex items-center gap-2 text-xs text-muted">
              DKIM <AuthChip state={data.mail.dkim} />
            </span>
            <span className="flex items-center gap-2 text-xs text-muted">
              DMARC <AuthChip state={data.mail.dmarc} />
            </span>
          </div>
        </Link>
      ) : null}
      {field?.territory ? (
        <div className="mt-6 flex flex-col gap-3 rounded-3xl bg-surface p-5 gold-hairline sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-gold">Ihr Gebiet</p>
            <p className="mt-1 font-medium">{field.territory.name}</p>
            <p className="text-sm text-muted">
              {field.openFollowups} offene Nachläufe · {field.week}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/app" className="rounded-xl bg-gold px-4 py-3 text-sm font-medium text-bg">
              Feld-App
            </Link>
            <Link to="/portal/feld" className="rounded-xl px-4 py-3 text-sm gold-hairline">
              Karte öffnen
            </Link>
            <button
              type="button"
              className="rounded-xl px-4 py-3 text-sm gold-hairline"
              onClick={async () => {
                try {
                  const file = await downloadMyTerritory();
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(new Blob([file.json], { type: "application/geo+json" }));
                  a.download = file.filename;
                  a.click();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Kein Gebiet");
                }
              }}
            >
              Gebiet herunterladen
            </button>
            <Link to="/portal/feld/woche" className="rounded-xl px-4 py-3 text-sm gold-hairline">
              Wochenliste
            </Link>
          </div>
        </div>
      ) : null}
      <div className="mt-6">
        <GoalCard />
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Dein Umsatz" value={eur(data.myTurnover || 0)} hint={`netto · zzgl. 19% = ${eur(vatOn(data.myTurnover || 0).gross)} brutto`} />
        <Kpi label="Abschlüsse Monat" value={String(data.monthWon)} hint={`Ziel ${data.target}`} />
        <Kpi label="Neue Aufträge" value={String(data.monthCount)} hint="diesen Monat" />
        <Kpi label="Provision offen" value={eur(data.commissionOpen)} hint={`netto · brutto ${eur(vatOn(data.commissionOpen).gross)} · frei ${eur(data.commissionApproved)}`} />
        {data.me.role === "super_admin" || data.me.role === "buchhaltung" ? (
          <>
            <Kpi label="Agentur New Sales" value={eur(data.agencyGross || 0)} hint={`Stufe 13 netto · brutto ${eur(vatOn(data.agencyGross || 0).gross)}`} />
            <Kpi label="An Mitarbeiter" value={eur(data.agencyAdvisor || 0)} hint={`deren Stufen netto · brutto ${eur(vatOn(data.agencyAdvisor || 0).gross)}`} />
            <Kpi label="E1-Marge" value={eur(data.agencyMargin || 0)} hint={`netto · brutto ${eur(vatOn(data.agencyMargin || 0).gross)} · abzgl. Fix ${eur(data.agencyFix || 0)}`} />
          </>
        ) : null}
        <Kpi label="Stornos gesamt" value={String(data.storno)} hint={`${data.total} Aufträge`} />
        <Link to="/portal/postfach" className="block sm:col-span-2 xl:col-span-1">
          <Kpi
            label="Ungelesene Mails"
            value={String(data.mailUnread ?? 0)}
            hint="Firmenpostfach"
          />
        </Link>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <div className="rounded-3xl bg-surface p-5 gold-hairline lg:col-span-3">
          <h2 className="mb-4 text-sm font-medium">Pipeline</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pipe}>
                <XAxis dataKey="name" tick={{ fill: "#9a9588", fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={50} />
                <YAxis tick={{ fill: "#9a9588", fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#181c24", border: "1px solid #2a2d36" }} />
                <Bar dataKey="n" fill="#c9a227" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-3xl bg-surface p-5 gold-hairline lg:col-span-2">
          <h2 className="mb-3 text-sm font-medium">Ranking Monat</h2>
          <ol className="space-y-2">
            {data.ranking.map((r, i) => (
              <li key={r.user_id} className="flex items-center justify-between text-sm">
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
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/portal/auftraege/neu" className="rounded-xl bg-gold px-4 py-3 text-sm font-medium text-bg">
          Eintrag
        </Link>
        <Link to="/app" className="rounded-xl px-4 py-3 text-sm gold-hairline">
          Feld-App
        </Link>
        <Link to="/portal/steuern" className="rounded-xl px-4 py-3 text-sm gold-hairline">
          Steuerbuch
        </Link>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {(Object.keys(data.pipeline) as Array<keyof typeof data.pipeline>).map((s) => (
          <span key={s} className="flex items-center gap-2 text-xs text-muted">
            <StatusBadge status={s} /> {data.pipeline[s]}
          </span>
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-3xl bg-surface p-5 gold-hairline">
      <p className="text-xs uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-2 font-display text-3xl tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  );
}
