export type KuendigungInput = {
  first: string;
  last: string;
  street: string;
  house: string;
  zip: string;
  city: string;
  email?: string;
  phone?: string;
  provider: string;
  customerNo?: string;
  meter?: string;
  endDate?: string;
  type?: string;
};

export function kuendigungLines(d: KuendigungInput): string[] {
  const name = `${d.first} ${d.last}`.trim();
  const addr = `${d.street} ${d.house}, ${d.zip} ${d.city}`.replace(/\s+/g, " ").trim();
  const sparte = d.type === "gas" ? "Gaslieferung" : "Stromlieferung";
  const ende = d.endDate
    ? `zum ${d.endDate}`
    : "zum nächstmöglichen Zeitpunkt unter Einhaltung der vertraglichen Frist";
  return [
    "Kündigung Energieliefervertrag",
    "",
    `An ${d.provider || "den bisherigen Lieferanten"}`,
    "",
    "Absender",
    name,
    addr,
    d.phone ? `Telefon ${d.phone}` : "",
    d.email ? `E-Mail ${d.email}` : "",
    "",
    "Kündigung",
    "",
    `hiermit kündige ich / kündigen wir den Vertrag über die ${sparte} ${ende}.`,
    d.customerNo ? `Kunden- oder Vertragskontonummer: ${d.customerNo}` : "Kundennummer: der letzten Rechnung zu entnehmen.",
    d.meter ? `Zählernummer: ${d.meter}` : "",
    `Lieferstelle: ${addr}`,
    "",
    "Bitte bestätigen Sie die Kündigung schriftlich mit dem Beendigungsdatum.",
    "Ein Lieferantenwechsel soll ohne Unterbrechung erfolgen.",
    "",
    "Diese Kündigung kann der neue Lieferant bzw. E1 Direktvertrieb im Rahmen des Wechsels verwenden.",
    "",
    `Ort, Datum: ${d.city || "Groß-Rohrheim"}, ${new Date().toLocaleDateString("de-DE")}`,
    "",
    name,
    "/sign1/",
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "");
}
