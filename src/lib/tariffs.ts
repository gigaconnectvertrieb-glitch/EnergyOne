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

export function clampStufe(v: unknown): 1 | 2 | 3 {
  const n = Number(v);
  if (n === 2 || n === 3) return n;
  return 1;
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
