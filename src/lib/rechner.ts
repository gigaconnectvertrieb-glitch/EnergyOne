export type RechnerKind = "privat" | "gewerbe";
export type RechnerSparte = "strom" | "gas";

export type CompareTariff = {
  arbeitCt: number;
  grundEurYear: number;
  label: string;
};

export type RechnerInput = {
  kind: RechnerKind;
  sparte: RechnerSparte;
  kwh: number;
  currentArbeitCt: number;
  currentGrundEurYear: number;
  compare: CompareTariff;
};

export type RechnerResult = {
  currentYear: number;
  compareYear: number;
  saveYear: number;
  saveMonth: number;
  pct: number;
  ok: boolean;
};

export const PRIVAT_KWH: Record<string, { strom: number; gas: number; label: string }> = {
  "1": { strom: 1500, gas: 5000, label: "1 Person" },
  "2": { strom: 2500, gas: 8000, label: "2 Personen" },
  "3": { strom: 3500, gas: 12000, label: "3 Personen" },
  "4": { strom: 4500, gas: 16000, label: "4 Personen / Haus" },
};

export const GEWERBE_KWH: Record<string, { strom: number; gas: number; label: string }> = {
  klein: { strom: 10000, gas: 15000, label: "Klein (Büro, Praxis)" },
  mittel: { strom: 30000, gas: 40000, label: "Mittel (Laden, Gastro)" },
  gross: { strom: 100000, gas: 80000, label: "Größerer Betrieb" },
};

/** Nur Platzhalter, bis ihr echte Kundenpreise liefert. */
export const PLACEHOLDER_COMPARE: Record<RechnerKind, Record<RechnerSparte, CompareTariff>> = {
  privat: {
    strom: { arbeitCt: 29.5, grundEurYear: 144, label: "Richtwert Strom privat" },
    gas: { arbeitCt: 11.5, grundEurYear: 144, label: "Richtwert Gas privat" },
  },
  gewerbe: {
    strom: { arbeitCt: 24.9, grundEurYear: 180, label: "Richtwert Strom Gewerbe" },
    gas: { arbeitCt: 9.8, grundEurYear: 180, label: "Richtwert Gas Gewerbe" },
  },
};

export function yearCost(kwh: number, arbeitCt: number, grundEurYear: number) {
  const work = (Math.max(0, kwh) * Math.max(0, arbeitCt)) / 100;
  return Math.round((work + Math.max(0, grundEurYear)) * 100) / 100;
}

export function calcSavings(input: RechnerInput): RechnerResult {
  const kwh = Math.max(0, Number(input.kwh) || 0);
  const currentYear = yearCost(kwh, input.currentArbeitCt, input.currentGrundEurYear);
  const compareYear = yearCost(kwh, input.compare.arbeitCt, input.compare.grundEurYear);
  const saveYear = Math.round((currentYear - compareYear) * 100) / 100;
  const pct = currentYear > 0 ? Math.round((saveYear / currentYear) * 1000) / 10 : 0;
  return {
    currentYear,
    compareYear,
    saveYear,
    saveMonth: Math.round((saveYear / 12) * 100) / 100,
    pct,
    ok: kwh > 0 && input.currentArbeitCt > 0,
  };
}

export const RECHNER_DATENBEDARF = [
  "Arbeitspreis in ct/kWh brutto (Privat) bzw. netto (Gewerbe), getrennt Strom und Gas",
  "Grundpreis €/Jahr oder €/Monat, ebenfalls getrennt",
  "Ob der Preis bundesweit gilt oder je PLZ / Netzgebiet",
  "Neukundenbonus, ob nur im 1. Jahr, und ob er in der Ersparnis stehen soll",
  "Vertragslaufzeit und Preisgarantie in Monaten",
  "Gewerbe: SLP oder RLM, Leistungspreis €/kW falls RLM",
  "Ob USt, Netzentgelt und Umlagen schon im Arbeitspreis stecken",
];
