import { splitDeal, type TariffBand } from "@/lib/tariffs";
import { vatOn } from "@/lib/steuer";

export type VergleichOffer = {
  tariffId: string;
  provider: string;
  name: string;
  type: string;
  yearEur: number;
  arbeitCt: number;
  advisor: number;
  advisorGross: number;
  agency: number;
  margin: number;
  stufe: number;
  source: "api" | "katalog";
};

function hash32(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Vor der echten Tarifrechner-API: PLZ + Anbieter streuen den Arbeitspreis leicht. */
export function estimateArbeitCt(zip: string, provider: string, type: string) {
  const base = type === "gas" ? 11.2 : 28.4;
  const n = hash32(`${zip}|${provider}|${type}`) % 180;
  return Math.round((base + n / 100) * 10) / 10;
}

export function yearCost(kwh: number, arbeitCt: number, grund = 144) {
  return Math.round((kwh * (arbeitCt / 100) + grund) * 100) / 100;
}

export function rankOffers(
  rows: Array<{
    id: string;
    provider: string;
    name: string;
    type: string;
    bands: TariffBand[];
  }>,
  input: { zip: string; kwh: number; type: string; stufe: number },
): VergleichOffer[] {
  const list: VergleichOffer[] = [];
  for (const row of rows) {
    if (input.type && row.type !== input.type) continue;
    const split = splitDeal(row.bands, input.stufe, input.kwh);
    if (!split.ok) continue;
    const arbeitCt = estimateArbeitCt(input.zip, row.provider, row.type);
    const yearEur = yearCost(input.kwh, arbeitCt);
    const vat = vatOn(split.advisor);
    list.push({
      tariffId: row.id,
      provider: row.provider,
      name: row.name,
      type: row.type,
      yearEur,
      arbeitCt,
      advisor: split.advisor,
      advisorGross: vat.gross,
      agency: split.agency,
      margin: split.margin,
      stufe: split.stufe,
      source: "katalog",
    });
  }
  list.sort((a, b) => a.yearEur - b.yearEur || b.advisor - a.advisor);
  return list;
}
