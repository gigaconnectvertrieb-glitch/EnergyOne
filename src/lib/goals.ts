export type GoalPeriod = "week" | "month" | "year" | "total";

export type NudgeKind =
  | "morning"
  | "midday_ahead"
  | "midday_behind"
  | "evening"
  | "p25"
  | "p50"
  | "p90"
  | "p75"
  | "hit"
  | "behind";

export type BerlinParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  weekday: number;
};

export type GoalProgress = {
  period: GoalPeriod;
  periodKey: string;
  periodLabel: string;
  start: string;
  endExclusive: string;
  target: number;
  earned: number;
  remaining: number;
  pct: number;
  expected: number;
  expectedPct: number;
  ahead: number;
  daysLeft: number;
  dayIndex: number;
  daysTotal: number;
  dayTarget: number;
  hour: number;
};

export const GOAL_PRESETS = [3000, 5000, 8000, 10000, 12000, 15000, 17000, 25000, 50000] as const;

const MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function berlinParts(now = new Date()): BerlinParts {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(now)) map[p.type] = p.value;
  const wd: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    weekday: wd[map.weekday || ""] || 1,
  };
}

export function isoWeekKey(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const dow = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dow);
  const y = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(y, 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${y}-W${pad2(week)}`;
}

function addDays(year: number, month: number, day: number, delta: number) {
  const d = new Date(Date.UTC(year, month - 1, day + delta));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function ymd(year: number, month: number, day: number) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function periodBounds(period: GoalPeriod, now = new Date()) {
  const p = berlinParts(now);
  if (period === "total") {
    return {
      key: "total",
      label: "Gesamt",
      start: "2000-01-01",
      endExclusive: "2100-01-01",
      daysTotal: 1,
      dayIndex: 1,
      daysLeft: 0,
      hour: p.hour,
    };
  }
  if (period === "year") {
    const leap = (p.year % 4 === 0 && p.year % 100 !== 0) || p.year % 400 === 0;
    const last = leap ? 366 : 365;
    const startUtc = Date.UTC(p.year, 0, 1);
    const todayUtc = Date.UTC(p.year, p.month - 1, p.day);
    const dayIndex = Math.floor((todayUtc - startUtc) / 86400000) + 1;
    return {
      key: String(p.year),
      label: `Jahr ${p.year}`,
      start: ymd(p.year, 1, 1),
      endExclusive: ymd(p.year + 1, 1, 1),
      daysTotal: last,
      dayIndex,
      daysLeft: Math.max(0, last - dayIndex),
      hour: p.hour,
    };
  }
  if (period === "month") {
    const last = new Date(Date.UTC(p.year, p.month, 0)).getUTCDate();
    const next = p.month === 12 ? { year: p.year + 1, month: 1 } : { year: p.year, month: p.month + 1 };
    return {
      key: `${p.year}-${pad2(p.month)}`,
      label: `${MONTHS[p.month - 1]} ${p.year}`,
      start: ymd(p.year, p.month, 1),
      endExclusive: ymd(next.year, next.month, 1),
      daysTotal: last,
      dayIndex: p.day,
      daysLeft: Math.max(0, last - p.day),
      hour: p.hour,
    };
  }
  const back = p.weekday - 1;
  const mon = addDays(p.year, p.month, p.day, -back);
  const nextMon = addDays(mon.year, mon.month, mon.day, 7);
  return {
    key: isoWeekKey(p.year, p.month, p.day),
    label: `KW ${isoWeekKey(p.year, p.month, p.day).slice(6)}`,
    start: ymd(mon.year, mon.month, mon.day),
    endExclusive: ymd(nextMon.year, nextMon.month, nextMon.day),
    daysTotal: 7,
    dayIndex: p.weekday,
    daysLeft: Math.max(0, 7 - p.weekday),
    hour: p.hour,
  };
}

export function clampGoal(n: unknown) {
  const v = Math.round(Number(n) || 0);
  if (v < 0) return 0;
  if (v > 1_000_000) return 1_000_000;
  return v;
}

export function asPeriod(v: unknown): GoalPeriod {
  if (v === "week" || v === "year" || v === "total") return v;
  return "month";
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function goalProgress(input: {
  target: number;
  earned: number;
  period: GoalPeriod;
  now?: Date;
}): GoalProgress {
  const b = periodBounds(input.period, input.now);
  const target = clampGoal(input.target);
  const earned = Math.max(0, round2(Number(input.earned) || 0));
  const remaining = Math.max(0, round2(target - earned));
  const pct = target > 0 ? Math.min(999, Math.round((earned / target) * 1000) / 10) : 0;
  const elapsed = b.daysTotal > 0 ? Math.min(1, Math.max(0, (b.dayIndex - 1 + Math.min(b.hour, 23) / 24) / b.daysTotal)) : 0;
  const expected = input.period === "total" ? 0 : round2(target * elapsed);
  const expectedPct = input.period === "total" ? 0 : target > 0 ? Math.round((expected / target) * 1000) / 10 : 0;
  const dayTarget = b.daysLeft > 0 && remaining > 0 ? round2(remaining / Math.max(1, b.daysLeft)) : 0;
  return {
    period: input.period,
    periodKey: b.key,
    periodLabel: b.label,
    start: b.start,
    endExclusive: b.endExclusive,
    target,
    earned,
    remaining,
    pct,
    expected,
    expectedPct,
    ahead: round2(earned - expected),
    daysLeft: b.daysLeft,
    dayIndex: b.dayIndex,
    daysTotal: b.daysTotal,
    dayTarget,
    hour: b.hour,
  };
}

export function pickNudgeKinds(p: GoalProgress, opts?: { nudge?: boolean }) {
  if (!opts?.nudge || p.target <= 0) return [] as NudgeKind[];
  const kinds: NudgeKind[] = [];
  if (p.pct >= 100) kinds.push("hit");
  else {
    if (p.pct >= 90) kinds.push("p90");
    else if (p.pct >= 75) kinds.push("p75");
    else if (p.pct >= 50) kinds.push("p50");
    else if (p.pct >= 25) kinds.push("p25");
    if (p.hour >= 6 && p.hour <= 11) kinds.push("morning");
    if (p.hour >= 12 && p.hour <= 16) kinds.push(p.ahead >= 0 ? "midday_ahead" : "midday_behind");
    if (p.hour >= 17 && p.hour <= 21) kinds.push("evening");
    if (p.period !== "total" && p.dayIndex >= 10 && p.pct + 15 < p.expectedPct) kinds.push("behind");
  }
  return kinds;
}

function money(n: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

export function nudgeCopy(kind: NudgeKind, p: GoalProgress): { title: string; message: string } {
  const t = money(p.target);
  const e = money(p.earned);
  const r = money(p.remaining);
  const exp = money(p.expected);
  const day = money(p.dayTarget);
  switch (kind) {
    case "morning":
      return {
        title: "Heute zählt.",
        message: `${p.periodLabel}: Ziel ${t}. Bisher ${e}. Noch ${r}.`,
      };
    case "midday_ahead":
      return {
        title: "Vorsprung.",
        message: `${e} von ${t}. ${money(p.ahead)} über dem Plan.`,
      };
    case "midday_behind":
      return {
        title: "Unter Tempo.",
        message: `Soll bis jetzt ${exp}, stehen ${e}. Noch ${p.daysLeft} Tage.`,
      };
    case "evening":
      return {
        title: "Stand heute",
        message: `${e} von ${t}. Morgen ${day} als Tagessoll.`,
      };
    case "p25":
      return { title: "Erstes Viertel.", message: `${e} von ${t} stehen.` };
    case "p50":
      return { title: "Halbzeit.", message: `Die Hälfte von ${t} ist da. Noch ${r}.` };
    case "p75":
      return { title: "Drei Viertel.", message: `Noch ${r} bis ${t}.` };
    case "p90":
      return { title: "Fast da.", message: `Nur noch ${r} zum Ziel.` };
    case "hit":
      return { title: "Ziel erreicht.", message: `${e} in ${p.periodLabel}. Weiter so.` };
    case "behind":
      return {
        title: "Tempo anziehen.",
        message: `Plan ${exp}, Ist ${e}. Noch ${p.daysLeft} Tage für ${r}.`,
      };
  }
}
