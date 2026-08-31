import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, MapPin } from "lucide-react";
import { getAppToday } from "@/lib/server/plan-api";
import { logFieldVisit } from "@/lib/server/field-api";
import { VISIT_LABELS, type VisitReason } from "@/lib/field";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/")({ component: Page });

const ACTIONS: VisitReason[] = [
  "nicht_angetroffen",
  "kein_zutritt",
  "laufzeit_passt_nicht",
  "spaeter",
  "kein_interesse",
  "abschluss",
];

type Stop = { id: string; seq: number; street: string; lat: number; lng: number };

function Page() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getAppToday>> | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Stop | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getAppToday()
      .then(setData)
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Fehler"));
  }, []);

  const remaining = useMemo(() => (data?.stops || []).filter((s) => !done.has(s.id)), [data, done]);
  const next = remaining[0] || null;
  const total = data?.stops.length || 0;
  const pct = total ? Math.round(((total - remaining.length) / total) * 100) : 0;

  async function mark(stop: Stop, reason: VisitReason) {
    setBusy(true);
    try {
      await logFieldVisit({
        data: { doorId: stop.id, reason, street: stop.street, lat: stop.lat, lng: stop.lng },
      });
      setDone((prev) => new Set(prev).add(stop.id));
      setOpen(null);
      toast.success(`${stop.street} · ${VISIT_LABELS[reason]}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nicht gespeichert");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <div className="h-48 animate-pulse rounded-2xl bg-surface" />;

  return (
    <div>
      <div className="rounded-2xl bg-gradient-to-br from-[#161922] to-[#0e1016] p-4 gold-hairline">
        <p className="text-[10px] uppercase tracking-[0.22em] text-gold">Heutige Tour</p>
        <div className="mt-1 flex items-end justify-between gap-3">
          <h1 className="font-display text-3xl leading-none">{data.city || data.name}</h1>
          <p className="text-sm text-muted">
            {remaining.length}/{total}
          </p>
        </div>
        <p className="mt-2 text-xs text-muted">
          {data.day ? `Tag ${data.day}` : "Kein Plan"}
          {data.meters ? ` · ${(data.meters / 1000).toFixed(1)} km` : ""}
          {data.openFollowups ? ` · ${data.openFollowups} Nachlauf` : ""}
        </p>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
        </div>
        <Link
          to="/app/karte"
          className="mt-3 inline-flex min-h-10 items-center gap-2 text-xs uppercase tracking-[0.16em] text-gold"
        >
          <MapPin className="size-3.5" /> Laufweg auf der Karte
        </Link>
      </div>

      {next ? (
        <button
          type="button"
          onClick={() => setOpen(next)}
          className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-gold px-4 py-3 text-left text-bg"
        >
          <span className="grid size-8 place-items-center rounded-full bg-bg/15 font-display text-lg">
            {next.seq}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] uppercase tracking-[0.16em] opacity-70">Als nächstes</span>
            <span className="block truncate font-medium">{next.street}</span>
          </span>
          <ChevronRight className="size-4 shrink-0" />
        </button>
      ) : total ? (
        <p className="mt-4 rounded-2xl bg-surface px-4 py-3 text-sm text-gold">Tour für heute durch.</p>
      ) : (
        <p className="mt-4 text-sm text-muted">Leitung weist dir in der Gebietsplanung eine Zone zu.</p>
      )}

      <ol className="mt-4 divide-y divide-white/6 overflow-hidden rounded-2xl bg-surface">
        {(data.stops || []).map((s) => {
          const isDone = done.has(s.id);
          const isNext = next?.id === s.id;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setOpen(s)}
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 px-4 text-left",
                  isDone && "opacity-40",
                  isNext && "bg-gold/8",
                )}
              >
                <span className="w-6 font-display text-sm text-gold">{s.seq}</span>
                <span className={cn("flex-1 truncate text-[15px]", isDone && "line-through")}>{s.street}</span>
                <ChevronRight className="size-4 text-muted" />
              </button>
            </li>
          );
        })}
      </ol>

      {open ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={() => setOpen(null)}>
          <div
            className="w-full rounded-t-3xl bg-[#12141b] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] gold-hairline"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[10px] uppercase tracking-[0.2em] text-gold">Straße {open.seq}</p>
            <h2 className="mt-1 font-display text-2xl">{open.street}</h2>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {ACTIONS.map((r) => (
                <Button
                  key={r}
                  size="sm"
                  variant={r === "nicht_angetroffen" ? "default" : "outline"}
                  disabled={busy}
                  onClick={() => void mark(open, r)}
                >
                  {VISIT_LABELS[r]}
                </Button>
              ))}
            </div>
            <button type="button" className="mt-3 w-full py-2 text-sm text-muted" onClick={() => setOpen(null)}>
              Abbrechen
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
