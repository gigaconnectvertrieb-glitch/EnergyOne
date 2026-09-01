export type TariffBand = {
  stufe: number;
  kwh_from: number;
  kwh_to: number;
  amount_eur: number;
  amount_ct_kwh: number;
};

export type Tariff = {
  id: string;
  provider: string;
  name: string;
  external_id: string;
  type: "strom" | "gas";
  active?: boolean;
  bands?: TariffBand[];
};

/** New Sales VP-Liste Luca/Orhan. */
export const AGENCY_STUFE = 13;

/** Mitarbeiteranteil an der Agentur-Provision, falls keine eigene Band-Liste. 86/160 ≈ 0,54. */
export const STAFF_SHARE: Record<number, number> = {
  1: 0.54,
  2: 0.72,
  3: 0.88,
  13: 1,
};

export function clampStufe(v: unknown): 1 | 2 | 3 | 13 {
  const n = Number(v);
  if (n === 2 || n === 3 || n === 13) return n;
  return 1;
}

export function isAgencyStufe(stufe: number) {
  return stufe >= AGENCY_STUFE;
}

export function commissionFromBand(band: TariffBand, kwh: number) {
  const extra = band.amount_ct_kwh ? kwh * band.amount_ct_kwh : 0;
  return Math.round((band.amount_eur + extra) * 100) / 100;
}

export function matchBand(bands: TariffBand[], stufe: number, kwh: number): TariffBand | null {
  const hits = bands.filter((b) => b.stufe === stufe && kwh >= b.kwh_from && kwh <= b.kwh_to);
  if (hits.length === 0) return null;
  hits.sort((a, b) => b.kwh_from - a.kwh_from);
  return hits[0];
}

export function formatKwhRange(from: number, to: number) {
  return `${from.toLocaleString("de-DE")}–${to.toLocaleString("de-DE")} kWh`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Agentur (Stufe 13) vs Mitarbeiter (1–3). Marge bleibt bei E1. */
export function splitDeal(bands: TariffBand[], stufe: number, kwh: number) {
  const s = clampStufe(stufe);
  const agencyBand = matchBand(bands, AGENCY_STUFE, kwh);
  const staffBand = matchBand(bands, isAgencyStufe(s) ? AGENCY_STUFE : s, kwh) || matchBand(bands, s, kwh);
  let agency = agencyBand ? commissionFromBand(agencyBand, kwh) : 0;
  let advisor = staffBand ? commissionFromBand(staffBand, kwh) : 0;
  const share = STAFF_SHARE[s] ?? STAFF_SHARE[1]!;
  if (!agency && advisor) agency = isAgencyStufe(s) ? advisor : round2(advisor / share);
  if (!advisor && agency) advisor = isAgencyStufe(s) ? agency : round2(agency * share);
  if (isAgencyStufe(s)) {
    const all = agency || advisor;
    return { ok: all > 0, stufe: s, agency: all, advisor: all, margin: 0 };
  }
  const margin = round2(Math.max(0, agency - advisor));
  return { ok: advisor > 0 || agency > 0, stufe: s, agency, advisor, margin };
}