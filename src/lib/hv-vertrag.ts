/** Handelsvertretervertrag nach HGB — Vorlage, vor Live-Einsatz anwaltlich prüfen. */

export type HvInput = {
  first: string;
  last: string;
  street: string;
  house: string;
  zip: string;
  city: string;
  email?: string;
  phone?: string;
  staffId?: string;
  birth?: string;
  taxId?: string;
  tradeNo?: string;
  start?: string;
  region?: string;
  stufe?: number;
  bands?: HvBand[];
};

export type HvBand = {
  provider: string;
  name: string;
  type: string;
  kwh_from: number;
  kwh_to: number;
  amount_eur: number;
  amount_ct_kwh: number;
};

export function formatHvBandLine(b: HvBand) {
  const from = Number(b.kwh_from).toLocaleString("de-DE");
  const to = Number(b.kwh_to) >= 999999 ? "offen" : Number(b.kwh_to).toLocaleString("de-DE");
  const euro = Number(b.amount_eur).toFixed(2).replace(".", ",");
  const extra = Number(b.amount_ct_kwh)
    ? ` + ${String(b.amount_ct_kwh).replace(".", ",")} ct/kWh`
    : "";
  return `${b.provider} · ${b.name} · ${b.type} · ${from}-${to} kWh · ${euro} EUR${extra}`;
}

export function fillHvAnlage1(bands: HvBand[] | undefined, stufe: number): string[] {
  const rows = (bands || []).filter((b) => Number.isFinite(Number(b.amount_eur)));
  const body = rows.length
    ? rows.map((b, i) => `${String(i + 1).padStart(2, "0")}   ${formatHvBandLine(b)}`)
    : ["[Provisionsliste Stufe 1 wird beim Erzeugen aus dem Portal übernommen]"];
  return [
    "ANLAGE 1 — PROVISIONSORDNUNG STUFE 1 (Stand Vertragsbeginn)",
    "",
    "Gültig ab Vertragsbeginn. Beträge netto, zzgl. gesetzlicher USt., soweit anfallend.",
    `Dieser Vertrag startet in Stufe ${stufe}. Nur die nachstehenden Stufe-1-Sätze gelten.`,
    "Stufe 2 und 3 gelten erst nach unterzeichneter Zusatzvereinbarung oder Freischaltung durch die GF.",
    "Keine Strukturprovision in Stufe 1.",
    "Fällig nach Bestätigung und Ablauf der 14-tägigen Kunden-Widerrufsfrist.",
    "Storno innerhalb 14 Tagen: voller Wegfall. Danach keine Rückrechnung außer bei Pflichtverletzung.",
    "",
    `Anzahl Positionen Stufe 1: ${rows.length}`,
    "Nr.  Anbieter · Tarif · Sparte · Verbrauch · Abschlussprovision",
    "",
    ...body,
  ];
}

export function fillHvProvisionSheet(d: HvInput): string[] {
  const name = `${dash(d.first, "[Vorname]")} ${dash(d.last, "[Nachname]")}`.trim();
  const stufe = Math.min(3, Math.max(1, Number(d.stufe) || 1));
  return [
    "E1 DIREKTVERTRIEB",
    "PROVISIONSORDNUNG",
    "",
    "Anlage zum Handelsvertretervertrag  |  vertraulich",
    "",
    `Handelsvertreter: ${name}`,
    `Mitarbeiter-ID: ${dash(d.staffId, "[ID]")}`,
    `Stufe: ${stufe}    Gebiet: ${dash(d.region, "[Gebiet]")}`,
    `Gültig ab: ${dash(d.start, "Vertragsbeginn")}`,
    "",
    "Beträge in EUR netto. Gesetzliche USt. extra, soweit anfallend.",
    "Fällig nach Bestätigung des Kundenvertrags und Ablauf von 14 Tagen Widerruf.",
    "Storno in diesen 14 Tagen: voller Wegfall. Danach keine Rückrechnung außer Pflichtverletzung.",
    "Höherstufung nur durch Zusatzvereinbarung der Geschäftsführung.",
    "",
    ...fillHvAnlage1(d.bands, stufe),
    "",
    "E1 Direktvertrieb  ·  Inhaber Orhan Salo und Luca-Marco Marrancone",
    "business@e1direktvertrieb.de",
  ];
}

export function musterHvInput(): HvInput {
  return {
    first: "[Vorname]",
    last: "[Nachname]",
    street: "[Straße]",
    house: "[Nr.]",
    zip: "[PLZ]",
    city: "[Ort]",
    email: "[E-Mail]",
    phone: "[Telefon]",
    staffId: "[Mitarbeiter-ID]",
    birth: "[TT.MM.JJJJ]",
    taxId: "[Steuer-ID / USt-IdNr.]",
    tradeNo: "[Gewerbeanmeldung]",
    start: "[Datum Beginn]",
    region: "[zugewiesenes Gebiet]",
    stufe: 1,
  };
}

export function dash(v?: string | null, fallback = "[Platzhalter]") {
  const s = (v ?? "").trim();
  return s || fallback;
}

export function fillHvVertrag(d: HvInput): string[] {
  const name = `${dash(d.first, "[Vorname]")} ${dash(d.last, "[Nachname]")}`.trim();
  const addr = `${dash(d.street, "[Straße]")} ${dash(d.house, "[Nr.]")}, ${dash(d.zip, "[PLZ]")} ${dash(d.city, "[Ort]")}`;
  const start = dash(d.start, "dem Tag der beiderseitigen Unterschrift");
  const stufe = Math.min(3, Math.max(1, Number(d.stufe) || 1));
  const staff = dash(d.staffId, "wird bei Anlage im Portal gesetzt");
  const region = dash(d.region, "das vom Unternehmer zugewiesene Gebiet");

  return [
    "E1 DIREKTVERTRIEB",
    "HANDELSVERTRETERVERTRAG",
    "",
    "selbststaendiger Handelsvertreter nach §§ 84 ff. HGB",
    "kein Arbeitsverhältnis",
    "",
    "E1 Direktvertrieb",
    "Inhaber: Orhan Salo und Luca-Marco Marrancone",
    "business@e1direktvertrieb.de  |  info@e1direktvertrieb.de",
    "Anschrift: [Geschäftsadresse — Platzhalter]",
    "",
    "Handelsvertreter",
    `Name: ${name}`,
    `Anschrift: ${addr}`,
    `Mitarbeiter-ID: ${staff}`,
    `Telefon: ${dash(d.phone)}    E-Mail: ${dash(d.email)}`,
    `Geburtsdatum: ${dash(d.birth)}    Steuer-ID: ${dash(d.taxId)}`,
    `Gewerbe: ${dash(d.tradeNo)}`,
    `Beginn: ${start}    Gebiet: ${region}    Stufe: ${stufe}`,
    "",
    "---PAGE---",
    "",
    "§ 1 Vertragsparteien",
    "Unternehmer ist E1 Direktvertrieb, Inhaber Orhan Salo und Luca-Marco Marrancone.",
    `Handelsvertreter ist ${name}, Anschrift ${addr}.`,
    "",
    "§ 2 Rechtsverhältnis — selbstständig, kein Arbeitsverhältnis",
    "(1) Tätigkeit als selbstständiger Handelsvertreter nach § 84 Abs. 1 HGB auf eigene Rechnung.",
    "Kein Arbeitsverhältnis, keine Sozialversicherung über E1, keine Lohnsteuer durch E1.",
    "(2) Freie Einteilung von Zeit und Tour, soweit Gebiet, Qualität und Marke von E1 gewahrt bleiben.",
    "(3) Gewerbe, Steuern und USt. führt der Handelsvertreter selbst.",
    "",
    "§ 3 Beginn, Gebiet, Portal",
    `(1) Beginn: ${start}, unbestimmte Zeit.`,
    `(2) Gebiet: ${region}. Zuweisung und Änderung über das Portal.`,
    "(3) Zugang zum E1-Portal (Mitarbeiter-ID, Authenticator). Dokumentation dort.",
    "",
    "§ 4 Aufgaben",
    "(1) Vermittlung von Strom-/Gasverträgen und benannten Produkten (New Sales, später E1-Tarife).",
    "(2) Wahrheitsgemäße Beratung (EnWG, UWG, PAngV, Schulung).",
    "(3) Keine irreführenden Preis-, Identitäts- oder Widerrufsangaben.",
    "(4) Kundendaten nur im Portal; DSGVO.",
    "",
    "§ 5 Pflichten von E1",
    "Schulung, Produktinfo, Portal, Gebiet, Abrechnung nach Provisionsordnung.",
    "",
    "§ 6 Provisionserklärung",
    "(1) Der Handelsvertreter erhält für vermittelte, wirksam zustande gekommene Verträge",
    "eine Abschlussprovision nach der jeweils geltenden Provisionsordnung und Stufe.",
    `(2) Beginn ausschließlich Stufe ${stufe}. Keine automatische Höherstufung.`,
    "(3) Die konkreten Provisionssätze sind nicht in dieser Urkunde aufgeführt.",
    `Sie werden gesondert als PDF an ${dash(d.email, "die hinterlegte E-Mail")} versandt`,
    "(Funktion „Provisionen per Mail“ im Portal). Mit Zugang der E-Mail gilt die Ordnung.",
    "(4) Fällig nach Status bestätigt und Ablauf der 14-tägigen Kunden-Widerrufsfrist.",
    "Auszahlung nach Portal-Periode auf das angegebene Konto, ggf. gegen Rechnung.",
    "(5) Folge-/Bestand/Struktur nur wenn in der per Mail übermittelten Ordnung vorgesehen",
    "oder im Portal freigeschaltet. Eigene Kosten trägt der Handelsvertreter.",
    "(6) Änderungen der Ordnung nur in Textform / per E-Mail. Höherstufung nur Zusatzvereinbarung.",
    "",
    "§ 7 Stufen — nur durch Zusatzvereinbarung",
    "Stufen 1, 2 und 3 regeln nur die Provision, kein Arbeitsverhältnis.",
    `(2) Start in Stufe ${stufe}. Höherstufung nur durch unterzeichnete Zusatzvereinbarung`,
    "oder Freischaltung durch die GF (Orhan Salo / Luca-Marco Marrancone).",
    "",
    "§ 8 Storno und Widerruf des Kunden",
    "(1) Endkunden: gesetzliches Widerrufsrecht von 14 Tagen.",
    "(2) Widerruf oder Storno innerhalb von 14 Tagen: Provisionsanspruch entfällt, Rückzahlung.",
    "(3) Danach keine Rückrechnung, außer Täuschung, Drohung oder grobe Pflichtverletzung.",
    "",
    "§ 9 Abrechnung",
    "Prüfung unverzüglich. Einwendungen binnen 14 Tagen, sonst genehmigt. Verrechnung zulässig.",
    "",
    "§ 10 Vertraulichkeit und Wettbewerb",
    "Kundendaten und Geschäftsgeheimnisse vertraulich, auch nach Ende.",
    "Während der Laufzeit keine Vermittlung gleicher Energieprodukte für Wettbewerber im Gebiet.",
    "Kein nachvertragliches Wettbewerbsverbot (§ 90a HGB bewusst nicht vereinbart).",
    "",
    "§ 11 Kündigung (§ 89 HGB)",
    "Jahr 1: 1 Monat; Jahr 2: 2 Monate; Jahr 3–5: 3 Monate; danach 6 Monate, jeweils zum Monatsende.",
    "Fristlos aus wichtigem Grund (§ 89a HGB). Textform an business@e1direktvertrieb.de.",
    "",
    "§ 12 Ausgleichsanspruch (§ 89b HGB)",
    "Bleibt nach dem Gesetz unberührt. Vorausverzicht unwirksam.",
    "",
    "§ 13 Haftung",
    "Unbeschränkt bei Vorsatz, grober Fahrlässigkeit, Leben/Körper/Gesundheit.",
    "Sonst bei wesentlichen Pflichten, begrenzt auf den vorhersehbaren Schaden.",
    "Kein Mindestverdienst, keine Erfolgsgarantie.",
    "",
    "§ 14 Vertragsstrafen",
    "Kaufmann, § 348 HGB. Je Fall, soweit zulässig:",
    "Datenmissbrauch 5.000 EUR; Wettbewerb im Gebiet 5.000 EUR; Abwerben 2.500 EUR;",
    "Falschberatung / Identitätstäuschung 5.000 EUR; Kundengelder 5.000 EUR;",
    "Zugangsweitergabe 3.000 EUR; unerlaubte Untervertretung 2.500 EUR; Rufschädigung 2.500 EUR.",
    "Cap 25.000 EUR je Lebenssachverhalt, Anrechnung auf Schadensersatz. Entfällt ohne Verschulden.",
    "",
    "§ 15 Freistellung",
    "Freistellung von Ansprüchen Dritter aus Pflichtverletzung des Handelsvertreters",
    "(UWG, EnWG, DSGVO, Falschberatung). Verrechnung mit Provision zulässig.",
    "",
    "§ 16 Keine Vollmacht",
    "Nur Entgegennahme von Anträgen auf E1-Formularen. Keine eigenen Preise, kein Inkasso,",
    "keine Markennutzung ohne Freigabe. Mündliche Kundenzusagen binden E1 nicht.",
    "",
    "§ 17 Nachweise",
    "Berufshaftpflicht empfohlen (mind. 1.000.000 EUR). Vor Aufnahme: Gewerbe, Ausweis, Steuer-ID, Bank, Vertrag.",
    "",
    "§ 18 Herausgabe",
    "Bei Ende: Unterlagen, Daten, Zugang. Provisionen nicht abtretbar ohne Zustimmung.",
    "",
    "§ 19 Schluss",
    "Deutsches Recht. Gerichtsstand Sitz E1, soweit zulässig.",
    "Änderungen in Textform. Anlagen 1–4 sind Bestandteil.",
    "Salvatorisch: unwirksame Klausel wird durch gesetzliche Regelung ersetzt.",
    "",
    "---PAGE---",
    "",
    "UNTERSCHRIFTEN",
    "",
    `Ort, Datum: ________________`,
    "",
    `Handelsvertreter: ${name}`,
    "Unterschrift: ________________    /sign1/",
    "",
    "E1 Direktvertrieb",
    "Orhan Salo: ________________",
    "Luca-Marco Marrancone: ________________",
    "",
    "---PAGE---",
    "",
    "ANLAGE 1 — PROVISIONSORDNUNG (gesondert per E-Mail)",
    "Die Provisionssätze sind nicht Bestandteil dieser Vertragsurkunde.",
    `E1 übermittelt die jeweils geltende Provisionsordnung als PDF an ${dash(d.email, "die hinterlegte E-Mail")}.`,
    "Mit Zugang der E-Mail wird die Ordnung für die vereinbarte Stufe verbindlich.",
    "Aktualisierungen ebenfalls per E-Mail. Ältere Listen gelten bis zum Zugang der neuen.",
    "Stufe 2 und 3 nur nach Zusatzvereinbarung (Anlage 4) oder Freischaltung durch die GF.",
    "",
    "---PAGE---",
    "",
    "ANLAGE 2 — AGB HANDELSVERTRETER",
    "1. Geltung für die selbstständige Vertriebstätigkeit; Kunden-AGB unberührt.",
    "2. Auftreten nur mit freigegebenen Mitteln. Keine eigenen Preisversprechen.",
    "3. Portalzugang persönlich. Authenticator nicht weitergeben.",
    "4. Keine unzulässige Werbung, kein E1-Auftritt in Social Media ohne Freigabe.",
    "5. Formulare und Ausweise bleiben bei E1 / Lieferant.",
    "6. Kein Bargeld, kein Inkasso, SEPA nur auf dem Formular.",
    "7. Haftung für eigene Hilfskräfte. Untervertreter nur mit Zustimmung.",
    "8. Aufrechnung nur mit unbestrittenen Forderungen. Provision nicht abtretbar.",
    "9. Vertragsstrafen: § 14 des Vertrags.",
    "",
    "ANLAGE 3 — DATENSCHUTZ",
    "Verantwortlich: E1 Direktvertrieb, Inhaber Orhan Salo und Luca-Marco Marrancone,",
    "business@e1direktvertrieb.de. Zwecke: Vertrag, Provision, Gebiet, Qualität, Pflichten.",
    "Art. 6 Abs. 1 lit. b, f, ggf. c DSGVO. Empfänger: Hosting EU, Google Workspace, Steuerberater.",
    "Speicher: Laufzeit plus gesetzliche Aufbewahrung (i. d. R. 10 Jahre). Rechte nach DSGVO.",
    "",
    "ANLAGE 4 — MUSTER ZUSATZVEREINBARUNG STUFE",
    `Handelsvertreter: ${name}    Mitarbeiter-ID: ${staff}`,
    "Ab dem ________ gilt Stufe ______ (2 oder 3). Übriger Vertrag unverändert.",
    "Ort/Datum: ________    HV: ________    Orhan Salo: ________    Luca-Marco Marrancone: ________",
  ];
}
