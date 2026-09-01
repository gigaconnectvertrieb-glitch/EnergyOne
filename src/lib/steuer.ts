/** Steuerkompass Einzelunternehmen / Handelsvertreter — Stand 2026. */

export const STEUER_YEAR = 2026;
export const KM_RATE = 0.3;
export const HOMEOFFICE_DAY = 6;
export const HOMEOFFICE_MAX = 1260;
export const KU_PREV = 25000;
export const KU_YEAR = 100000;
export const GEWST_FREE = 24500;
export const EST_FREE = 12348;
export const UST_RATE = 0.19;
export const MINIJOB = 603;

export const EXPENSE_CATS = {
  sprit: { label: "Sprit / Tanken", ba: true },
  kfz: { label: "Kfz (Versicherung, Wartung)", ba: true },
  park: { label: "Parken / Maut", ba: true },
  km: { label: "Kilometerpauschale 0,30 €", ba: true },
  telefon: { label: "Telefon / Internet", ba: true },
  homeoffice: { label: "Homeoffice-Pauschale", ba: true },
  werbung: { label: "Werbung / Ads", ba: true },
  fortbildung: { label: "Fortbildung", ba: true },
  steuerberater: { label: "Steuerberater", ba: true },
  ihk: { label: "IHK-Beitrag", ba: true },
  buero: { label: "Büro / Software", ba: true },
  bewirtung: { label: "Bewirtung (70 %)", ba: true, factor: 0.7 },
  krankenkasse: { label: "Kranken-/Pflegeversicherung", ba: false },
  rente: { label: "Rentenversicherung", ba: false },
  sonstiges: { label: "Sonstiges", ba: true },
} as const;

export type ExpenseCat = keyof typeof EXPENSE_CATS;

export function isExpenseCat(v: string): v is ExpenseCat {
  return v in EXPENSE_CATS;
}

export function splitMoney(amount: number, vatRate: number, gross: boolean) {
  const a = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  const r = vatRate > 0 ? vatRate : 0;
  if (!r) return { gross: a, net: a, vat: 0 };
  if (gross) {
    const net = a / (1 + r);
    return { gross: a, net, vat: a - net };
  }
  return { gross: a * (1 + r), net: a, vat: a * r };
}

export function baAmount(cat: ExpenseCat, net: number) {
  const factor = "factor" in EXPENSE_CATS[cat] ? Number(EXPENSE_CATS[cat].factor) : 1;
  if (!EXPENSE_CATS[cat].ba) return 0;
  return net * factor;
}

export function estReserve(taxable: number) {
  const over = Math.max(0, taxable - EST_FREE);
  if (over <= 0) return 0;
  if (over < 20000) return over * 0.2;
  if (over < 56152) return over * 0.3;
  return over * 0.42;
}

export function leftover(input: {
  proviPaid: number;
  expensesCash: number;
  ustSetAside: number;
  estSetAside: number;
}) {
  return input.proviPaid - input.expensesCash - input.ustSetAside - input.estSetAside;
}

export type Reminder = {
  key: string;
  title: string;
  due: string;
  hint: string;
  tone: "gold" | "warn" | "muted";
};

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function nextVatDeadline(from: Date, dauerfrist: boolean) {
  const y = from.getFullYear();
  const q = Math.floor(from.getMonth() / 3);
  const endMonth = q * 3 + 3;
  const due = new Date(y, endMonth, 10);
  if (dauerfrist) due.setMonth(due.getMonth() + 1);
  if (due < from) {
    const nextQ = q + 1;
    const ny = nextQ >= 4 ? y + 1 : y;
    const nq = nextQ % 4;
    const d2 = new Date(ny, nq * 3 + 3, 10);
    if (dauerfrist) d2.setMonth(d2.getMonth() + 1);
    return d2;
  }
  return due;
}

export function reminders(now: Date, opts: { kleinunternehmer: boolean; dauerfrist: boolean; year: number }): Reminder[] {
  const out: Reminder[] = [];
  if (!opts.kleinunternehmer) {
    const vat = nextVatDeadline(now, opts.dauerfrist);
    const days = Math.ceil((vat.getTime() - now.getTime()) / 86400000);
    out.push({
      key: "ust",
      title: "Umsatzsteuer-Voranmeldung",
      due: iso(vat),
      hint: opts.dauerfrist
        ? "Mit Dauerfristverlängerung: 10. des übernächsten Monats nach Quartalsende."
        : "Bis 10. des Monats nach Quartalsende.",
      tone: days <= 14 ? "warn" : "gold",
    });
  }
  out.push({
    key: "est",
    title: "Einkommensteuer + EÜR",
    due: `${opts.year + 1}-07-31`,
    hint: "Ohne Steuerberater: 31. Juli des Folgejahres. Mit Berater: Ende Februar des übernächsten Jahres.",
    tone: now.getMonth() >= 5 && now.getFullYear() === opts.year + 1 ? "warn" : "muted",
  });
  out.push({
    key: "berater",
    title: "Steuerberater / Belege",
    due: iso(new Date(now.getFullYear(), now.getMonth() + 1, 1)),
    hint: "Belege (Tanken, KV, IHK, Handy) monatlich ablegen — 8 Jahre aufbewahren.",
    tone: "gold",
  });
  out.push({
    key: "gewst",
    title: "Gewerbesteuererklärung",
    due: `${opts.year + 1}-07-31`,
    hint: `Freibetrag ${GEWST_FREE.toLocaleString("de-DE")} € Gewerbeertrag. Erklärung trotzdem abgeben.`,
    tone: "muted",
  });
  return out;
}
