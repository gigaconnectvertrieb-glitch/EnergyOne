import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, BellOff, Target } from "lucide-react";
import { disablePush, getMyGoal, savePush, setMyGoal } from "@/lib/server/goal-api";
import { GOAL_PRESETS, type GoalPeriod } from "@/lib/goals";
import { cn, eur } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { toast } from "sonner";

type Goal = Awaited<ReturnType<typeof getMyGoal>>;

function urlBase64ToUint8Array(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function standalone() {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone) || window.matchMedia("(display-mode: standalone)").matches;
}

export function usePushWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
}

function Ring({ pct }: { pct: number }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const v = Math.min(100, Math.max(0, pct));
  const dash = (v / 100) * c;
  return (
    <svg viewBox="0 0 100 100" className="size-24 shrink-0 -rotate-90">
      <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" className="text-line" strokeWidth="7" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="currentColor"
        className="text-gold"
        strokeWidth="7"
        strokeDasharray={`${dash} ${c}`}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function GoalStrip() {
  const [g, setG] = useState<Goal | null>(null);
  usePushWorker();
  useEffect(() => {
    getMyGoal().then(setG).catch(() => setG(null));
  }, []);
  if (!g || g.target <= 0) return null;
  const width = Math.min(100, g.pct);
  return (
    <Link to="/app/mehr" className="mx-4 mb-2 block rounded-2xl bg-surface px-3 py-2 gold-hairline">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted">{g.periodLabel}</span>
        <span className="tabular-nums text-gold">
          {eur(g.earned)} / {eur(g.target)}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-elevated">
        <div className="h-full rounded-full bg-gold" style={{ width: `${width}%` }} />
      </div>
    </Link>
  );
}

export function GoalCard({ compact = false }: { compact?: boolean }) {
  const [g, setG] = useState<Goal | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  usePushWorker();
  useEffect(() => {
    getMyGoal()
      .then((row) => {
        setG(row);
        setAmount(row.target ? String(row.target) : "");
      })
      .catch(() => setG(null));
  }, []);

  async function save(next?: Partial<{ targetEur: number; period: GoalPeriod; nudge: boolean }>) {
    if (!g) return;
    setBusy(true);
    try {
      const row = await setMyGoal({
        data: {
          targetEur: next && "targetEur" in next ? Number(next.targetEur) : amount.trim() ? clampInput(amount) : g.target,
          period: next?.period ?? g.period,
          nudge: next?.nudge ?? g.nudge,
        },
      });
      setG(row);
      setAmount(row.target ? String(row.target) : "");
      toast.success(row.target ? `Ziel ${eur(row.target)}` : "Ziel gelöscht");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function togglePush() {
    if (!g) return;
    if (g.pushOn) {
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = await reg?.pushManager.getSubscription();
        await sub?.unsubscribe();
        await disablePush({ data: { endpoint: sub?.endpoint } });
        setG({ ...g, pushOn: false });
        toast.success("Push aus");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Konnte Push nicht ausmachen");
      }
      return;
    }
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      toast.error("Dieser Browser kann keine Push-Nachrichten.");
      return;
    }
    if (!standalone() && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
      toast.error("iPhone: erst auf den Home-Bildschirm legen, dann Push an.");
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Mitteilungen wurden blockiert.");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(g.vapidPublic),
      });
      const json = sub.toJSON();
      await savePush({
        data: {
          endpoint: json.endpoint,
          keys: json.keys as { p256dh?: string; auth?: string },
          userAgent: navigator.userAgent,
        },
      });
      setG({ ...g, pushOn: true });
      toast.success("Push an. Erinnerungen kommen aufs Handy.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Push fehlgeschlagen");
    }
  }

  if (!g) return <div className="h-40 animate-pulse rounded-3xl bg-surface" />;

  const width = Math.min(100, g.pct);
  const pace =
    g.target <= 0
      ? "Eigenes Euro-Ziel setzen. Push erinnert morgens, mittags und abends."
      : g.pct >= 100
        ? "Ziel steht."
        : g.period === "total"
          ? `Noch ${eur(g.remaining)} bis zum Gesamtziel.`
          : g.earned === 0 && g.dayIndex <= 2
            ? `${g.daysLeft} Tage · Tagessoll ${eur(g.dayTarget)}.`
            : g.ahead >= 0
              ? `${eur(g.ahead)} vor dem Plan · ${g.daysLeft} Tage`
              : `${eur(Math.abs(g.ahead))} hinter dem Plan · noch ${eur(g.dayTarget)} / Tag`;

  return (
    <div className="rounded-3xl bg-surface p-5 gold-hairline">
      <div className="flex items-start gap-4">
        {g.target > 0 ? (
          <div className="relative">
            <Ring pct={g.pct} />
            <p className="absolute inset-0 grid place-items-center text-sm font-medium tabular-nums">{Math.round(g.pct)}%</p>
          </div>
        ) : (
          <div className="grid size-24 place-items-center rounded-full bg-elevated text-gold">
            <Target className="size-8" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.16em] text-gold">Ihr Ziel</p>
          <p className="mt-1 font-display text-3xl tabular-nums">
            {g.target > 0 ? eur(g.earned) : "Kein Ziel"}
          </p>
          <p className="text-sm text-muted">
            {g.target > 0 ? `von ${eur(g.target)} · ${g.periodLabel}` : "Summe festlegen, die Sie erreichen wollen."}
          </p>
          {g.target > 0 ? (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-elevated">
              <div className="h-full rounded-full bg-gold" style={{ width: `${width}%` }} />
            </div>
          ) : null}
          <p className="mt-2 text-xs text-muted">{pace}</p>
        </div>
      </div>

      {compact ? null : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {(
              [
                ["total", "Gesamt"],
                ["year", "Jahr"],
                ["month", "Monat"],
                ["week", "Woche"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs gold-hairline",
                  g.period === id && "bg-gold text-bg",
                )}
                onClick={() => void save({ period: id })}
              >
                {label}
              </button>
            ))}
            {GOAL_PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs gold-hairline",
                  g.target === n && "bg-gold text-bg",
                )}
                onClick={() => void save({ targetEur: n })}
              >
                {eur(n)}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Field label="Eigene Summe">
                <Input
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="8000"
                />
              </Field>
            </div>
            <Button size="sm" disabled={busy} onClick={() => void save()}>
              Speichern
            </Button>
            {g.target > 0 ? (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void save({ targetEur: 0 })}>
                Ziel aus
              </Button>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant={g.pushOn ? "gold" : "outline"} onClick={() => void togglePush()}>
              {g.pushOn ? <Bell className="size-4" /> : <BellOff className="size-4" />}
              {g.pushOn ? "Push an" : "Push aufs Handy"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void save({ nudge: !g.nudge })}
            >
              Erinnerungen {g.nudge ? "laufen" : "pausiert"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted">
            Morgens, mittags, abends und bei 25 / 50 / 75 / 90 / 100 Prozent. Nur an Sie, nur zu Ihrem Ziel.
          </p>
        </>
      )}
    </div>
  );
}

function clampInput(raw: string) {
  const n = Number(String(raw).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
