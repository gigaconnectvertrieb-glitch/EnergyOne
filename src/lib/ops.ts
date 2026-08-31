/** Betriebsregeln: New-Sales-Übergabe ohne API, Qualität, Provision, CSV. */

export const NEWSALES_CHANNEL = "paket_mail" as const;

export function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  if (/[;"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvTable(headers: string[], rows: unknown[][]) {
  return [headers.map(csvCell).join(";"), ...rows.map((r) => r.map(csvCell).join(";"))].join("\n");
}

export function stornoRate(total: number, stornos: number) {
  if (total <= 0) return 0;
  return stornos / total;
}

export function qualityVerdict(
  total: number,
  stornos: number,
  warnAt = 0.25,
  blockAt = 0.4,
): "ok" | "warn" | "block" {
  if (total < 3) return "ok";
  const rate = stornoRate(total, stornos);
  if (rate >= blockAt) return "block";
  if (rate >= warnAt) return "warn";
  return "ok";
}

export type HandoverInput = {
  id: string;
  type: string;
  product_name: string;
  provider: string;
  consumption_kwh: number;
  meter_number: string;
  previous_provider: string;
  start_date: string | null;
  iban: string;
  bank_owner: string;
  sepa: boolean;
  privacy: boolean;
  signature: boolean;
  notes: string;
  advisor: string;
  customer: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    street: string;
    house_number: string;
    zip: string;
    city: string;
    birth_date: string | null;
  };
};

export function newsalesPackage(input: HandoverInput) {
  const c = input.customer;
  return [
    "E1 DIREKTVERTRIEB — Übergabepaket New Sales",
    "Kanal: E-Mail / Datei. New Sales hat keine API.",
    `Auftrag: ${input.id}`,
    `Sparte: ${input.type}`,
    `Produkt: ${input.product_name} (${input.provider || "NewSales"})`,
    `Berater: ${input.advisor}`,
    "",
    "Kunde",
    `${c.first_name} ${c.last_name}`,
    `${c.street} ${c.house_number}`,
    `${c.zip} ${c.city}`,
    `Telefon ${c.phone}`,
    `E-Mail ${c.email || "—"}`,
    `Geburtsdatum ${c.birth_date || "—"}`,
    "",
    "Vertrag",
    `Jahresverbrauch ${input.consumption_kwh} kWh`,
    `Zählernummer ${input.meter_number || "fehlt"}`,
    `Altversorger ${input.previous_provider || "—"}`,
    `Lieferbeginn ${input.start_date || "—"}`,
    "",
    "Bank / Einwilligung",
    `IBAN ${input.iban}`,
    `Kontoinhaber ${input.bank_owner}`,
    `SEPA ${input.sepa ? "ja" : "nein"}`,
    `Datenschutz ${input.privacy ? "ja" : "nein"}`,
    `Unterschrift ${input.signature ? "ja" : "nein"}`,
    input.notes ? `Bemerkung ${input.notes}` : "",
    "",
    "Bitte in New Sales erfassen und den Auftrag im Portal auf Bestätigt setzen.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function laterCommission(kind: "folge" | "bestand", productAmount: number) {
  const amount = Number(productAmount) || 0;
  if (amount <= 0) return null;
  return { type: kind, amount };
}
