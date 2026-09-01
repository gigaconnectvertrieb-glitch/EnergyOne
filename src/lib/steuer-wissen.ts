/** Steuer-Dossier Handelsvertreter · Einzelunternehmen. Stand August 2026. */

export const STEUER_KENNZAHLEN = [
  { k: "Kleinunternehmergrenze", v: "25.000 € Vorjahr · 100.000 € laufendes Jahr" },
  { k: "Gewerbesteuer-Freibetrag", v: "24.500 € Gewerbeertrag / Jahr" },
  { k: "Grundfreibetrag ESt", v: "12.348 € steuerfreies zvE" },
  { k: "Kilometerpauschale", v: "0,30 € pro km, Geschäftsfahrt" },
  { k: "Homeoffice-Pauschale", v: "1.260 € max. / Jahr, 6 €/Tag" },
];

export const STEUER_PFLICHTEN = [
  {
    t: "Gewerbeanmeldung & Fragebogen",
    b: "Tätigkeit nach § 84 HGB ist gewerblich. Anmeldung beim Gewerbeamt, danach Fragebogen zur steuerlichen Erfassung (Kleinunternehmer ja/nein, Steuernummer).",
  },
  {
    t: "Einkommensteuer",
    b: "Gewinn über Anlage G und Anlage EÜR. Bis 12.348 € zvE steuerfrei, darüber progressiv (42 % ab ca. 68.500 €). Das FA kann vierteljährliche Vorauszahlungen festsetzen.",
  },
  {
    t: "Gewerbesteuer",
    b: "Einzelunternehmen: Freibetrag 24.500 €. Darunter i. d. R. keine GewSt, Erklärung trotzdem. Anrechnung auf ESt bis Hebesatz 400 %.",
  },
  {
    t: "Umsatzsteuer",
    b: "Kleinunternehmer (§ 19 UStG): Vorjahr ≤ 25.000 € und laufendes Jahr ≤ 100.000 € netto. Überschreiten der 100.000 € unterjährig beendet die Befreiung sofort. Sonst USt-VA (monatlich/quartalsweise), dafür Vorsteuerabzug. Die E1-Provisionsliste ist netto — 19 % USt kommen oben drauf (160 € → 190,40 € brutto), außer Kleinunternehmer.",
  },
  {
    t: "IHK",
    b: "Pflichtmitglied. Beitrag ist Betriebsausgabe.",
  },
  {
    t: "Rentenversicherung",
    b: "§ 2 S. 1 Nr. 9 SGB VI: prüfpflichtig, wenn keine SV-pflichtigen AN und im Wesentlichen ein Auftraggeber (Faustregel 5/6). Befreiung 3 Jahre möglich. Beiträge als Sonderausgaben.",
  },
  {
    t: "EÜR & Aufbewahrung",
    b: "Einnahmen-Überschuss-Rechnung, keine Bilanz. Belege mind. 8 Jahre.",
  },
  {
    t: "Rechnungen",
    b: "Name, Anschrift, Steuernummer/USt-IdNr., laufende Nr., Leistung, Datum. Kleinunternehmer: Hinweis „ohne USt gemäß § 19 UStG“.",
  },
];

export const STEUER_AUSGABEN = [
  { g: "Fahrzeug", items: ["0,30 €/km pauschal", "oder tatsächliche Kosten anteilig (Sprit, Versicherung, Wartung, AfA)", "Parken, Maut, Fähre bei Geschäftsfahrt", "Firmenwagen: 1 %-Regelung oder Fahrtenbuch"] },
  { g: "Arbeitsmittel", items: ["Laptop, Handy, Tablet", "GWG bis 250 € netto sofort", "250–800 € Sofort-AfA oder Sammelposten", "Sammelposten 250–1.000 € über 5 Jahre", "Werbematerial, Logo-Kleidung"] },
  { g: "Homeoffice", items: ["6 €/Tag, max. 1.260 € ohne Arbeitszimmer", "oder häusliches Arbeitszimmer, wenn Mittelpunkt der Tätigkeit"] },
  { g: "Werbung", items: ["Ads, Landingpage, Hosting, Druck, Give-aways"] },
  { g: "Kommunikation", items: ["20 % Telefon/Internet pauschal, max. 20 €/Monat", "oder höherer Nachweis; Geschäfts-Handy voll"] },
  { g: "Versicherungen", items: ["Betriebshaftpflicht / Rechtsschutz voll", "Kfz anteilig", "Kranken-, Pflege-, Rente: Sonderausgaben, nicht BA"] },
  { g: "Fortbildung", items: ["Zertifikate, Vertriebstraining, Fachliteratur"] },
  { g: "Reise / Bewirtung", items: ["Verpflegung 28 € ganztags / 14 € An-Abreise", "Übernachtung", "Bewirtung 70 %, Anlass und Teilnehmer auf Quittung"] },
  { g: "Verwaltung", items: ["Geschäftskonto, Software, IHK, Steuerberater, Büro, Porto"] },
];

export const STEUER_FRISTEN = [
  ["USt-Voranmeldung quartalsweise", "10. des Monats nach Quartalsende (Dauerfrist: +1 Monat)"],
  ["ESt + GewSt + EÜR", "ohne Berater: 31. Juli Folgejahr · mit Berater: Ende Februar übernächstes Jahr"],
  ["Belege", "mindestens 8 Jahre"],
];
