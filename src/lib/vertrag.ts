/** Deutsche Energieverträge mit Platzhaltern, bis Preise und Lieferant feststehen. */

export const PRICE_PLACEHOLDER = "—,—";

export type VertragArt = "strom" | "gas";
export type VertragKunde = "privat" | "gewerbe";

export type VertragData = {
  art: VertragArt;
  kind?: VertragKunde;
  company?: string;
  first: string;
  last: string;
  street: string;
  house: string;
  zip: string;
  city: string;
  email: string;
  phone: string;
  birth?: string;
  product: string;
  kwh: string;
  meter?: string;
  previous?: string;
  start?: string;
  advisor: string;
  iban?: string;
  owner?: string;
  arbeitspreis?: string;
  grundpreis?: string;
  laufzeitMonate?: string;
  lieferant?: string;
  ustId?: string;
};

export function dash(v?: string | null, fallback = PRICE_PLACEHOLDER) {
  const s = (v ?? "").trim();
  return s || fallback;
}

export function fillVertrag(d: VertragData): string[] {
  const gewerbe = d.kind === "gewerbe";
  const energie = d.art === "gas" ? "Gas (Erdgas)" : "Strom (elektrische Energie)";
  const titel = d.art === "gas" ? "GASLIEFERVERTRAG" : "STROMLIEFERVERTRAG";
  const gvv = d.art === "gas" ? "GasGVV" : "StromGVV";
  const ap = dash(d.arbeitspreis, `${PRICE_PLACEHOLDER} ct/kWh`);
  const gp = dash(d.grundpreis, `${PRICE_PLACEHOLDER} EUR/Monat`);
  const lieferant = dash(d.lieferant, "[Lieferant, Registergericht, HRB]");
  const laufzeit = dash(d.laufzeitMonate, "12");
  const start = dash(d.start, "nächstmöglicher Termin nach Netzbestätigung");
  const iban = dash(d.iban, "[IBAN]");
  const inhaber = dash(d.owner, `${d.first} ${d.last}`.trim() || "[Kontoinhaber]");
  const kundeName = gewerbe
    ? `${dash(d.company, "[Firma]")} vertreten durch ${dash(d.first, "[Vorname]")} ${dash(d.last, "[Nachname]")}`
    : `${dash(d.first, "[Vorname]")} ${dash(d.last, "[Nachname]")}`;
  const adresse = `${dash(d.street, "[Straße]")} ${dash(d.house, "[Nr.]")}, ${dash(d.zip, "[PLZ]")} ${dash(d.city, "[Ort]")}`;

  const kopf = [
    "E1 DIREKTVERTRIEB",
    "Inhaber Orhan Salo und Luca-Marco Marrancone",
    "info@e1direktvertrieb.de",
    "",
    titel,
    gewerbe ? "Geschäftskunde  |  Unternehmer  |  deutsches Recht" : "Haushaltskunde  |  Haustür- und Fernabsatz  |  deutsches Recht",
    "",
    "Vertragsurkunde. Fehlende Preise, Lieferant und Handelsregister sind",
    "Platzhalter und werden vor Unterschrift eingesetzt.",
    "",
    "§ 1 Vertragsparteien",
    `Kunde: ${kundeName}`,
    gewerbe && d.ustId ? `USt-IdNr.: ${d.ustId}` : "",
    `Lieferstelle: ${adresse}`,
    `Telefon: ${dash(d.phone, "[Telefon]")}    E-Mail: ${dash(d.email, "[E-Mail]")}`,
    !gewerbe ? (d.birth ? `Geburtsdatum: ${d.birth}` : "Geburtsdatum: [TT.MM.JJJJ]") : "",
    "",
    "Vermittler:",
    "E1 Direktvertrieb, Geschäftsführung Orhan Salo und Luca-Marco Marrancone",
    "Anschrift: [Straße, PLZ, Ort]",
    "Registergericht / HRB: [Platzhalter]    USt-IdNr.: [Platzhalter]",
    "",
    `Lieferant: ${lieferant}`,
    "E1 nimmt den Auftrag auf und leitet ihn an den Lieferanten weiter, solange",
    "E1 nicht selbst als Lieferant genannt ist.",
    "",
    "§ 2 Gegenstand",
    `Belieferung der Lieferstelle mit ${energie}.`,
    gewerbe
      ? "Nutzung für den Geschäftsbetrieb. Profil SLP, soweit nicht RLM vereinbart."
      : "Nutzung für den eigenen Haushaltsbedarf in Niederspannung bzw. Niederdruck.",
    `Es gelten EnWG, Netzzugangsverordnungen und ergänzend ${gvv}, soweit nicht abweichend vereinbart.`,
    `Produkt: ${dash(d.product, "[Tarifname]")}`,
    `Zählernummer: ${dash(d.meter, "[Zählernummer]")}`,
    `Bisheriger Lieferant: ${dash(d.previous, "[unbekannt]")}`,
    `Jahresverbrauch: ${dash(d.kwh, "[kWh]")} kWh`,
    `Berater: ${dash(d.advisor, "[Berater]")}`,
    "",
    "§ 3 Lieferbeginn",
    `Gewünschter Beginn: ${start}.`,
    "Lieferung startet, wenn der Netzbetreiber den Wechsel bestätigt.",
    !gewerbe ? "Ein Verzicht auf das Widerrufsrecht wird nicht vereinbart." : "",
    "",
    "§ 4 Preise (EnWG § 41)",
    gewerbe ? `Arbeitspreis netto: ${ap}` : `Arbeitspreis: ${ap}`,
    gewerbe ? `Grundpreis netto: ${gp}` : `Grundpreis: ${gp}`,
    "Hinzu kommen in gesetzlicher Höhe Umsatzsteuer, Strom- bzw. Energiesteuer,",
    "Netzentgelte, Messstellenbetrieb, Umlagen und Konzessionsabgabe.",
    "Die Beträge stehen vor Unterschrift im Preisblatt (Anlage 1).",
    "Neukundenbonus: [0,00 EUR, soweit nicht ausgewiesen].",
    "",
    "§ 5 Preisänderungen",
    "Änderungen nur nach Gesetz, mindestens einen Monat vorher in Textform.",
    "Betrifft die Änderung nicht nur Steuern, Umlagen oder Netzentgelte,",
    "kann der Kunde zum Wirksamwerden ohne Frist kündigen.",
    "",
    "§ 6 Laufzeit und Kündigung",
    `Erstlaufzeit: ${laufzeit} Monate ab Lieferbeginn.`,
    "Kündigungsfrist: ein Monat zum Ende der Erstlaufzeit.",
    "Ohne Kündigung verlängert sich der Vertrag auf unbestimmte Zeit und ist dann monatlich kündbar.",
    "Kündigung in Textform an info@e1direktvertrieb.de oder an den Lieferanten.",
    "Ein Umzug ist unverzüglich anzuzeigen.",
    "",
    "§ 7 Abrechnung und Messung",
    "Abrechnung in der Regel jährlich, dazu gesetzlich zulässige Abschläge.",
    "Zählerstände vom Kunden oder vom Messstellenbetreiber.",
    "Einwände gegen Rechnungen berechtigen nicht zur Zahlungsverweigerung,",
    "wenn der Fehler nicht offensichtlich ist.",
    "",
    "§ 8 Zahlung, SEPA",
    "Fällig mit Zugang der Rechnung. Bevorzugt SEPA-Lastschrift.",
    `Kontoinhaber: ${inhaber}`,
    `IBAN: ${iban}`,
    "Gläubiger-ID: [DE__ZZZ___________]",
    "Mandatsreferenz folgt der Vertragsnummer.",
    "Erstattung einer Lastschrift innerhalb von acht Wochen ab Belastung möglich.",
    "",
    "§ 9 Pflichten des Kunden",
    "Zugang zur Messeinrichtung. Änderungen von Anschrift, Bank und Verbrauch unverzüglich mitteilen.",
    "Keine unberechtigte Weitergabe der Energie.",
    "",
    "§ 10 Haftung",
    "Bei Netzstörung gelten die gesetzlichen Regeln gegenüber dem Netzbetreiber.",
    "Unbeschränkt bei Vorsatz, grober Fahrlässigkeit und bei Verletzung von Leben, Körper, Gesundheit.",
    "Bei leichter Fahrlässigkeit nur für wesentliche Pflichten, begrenzt auf den vorhersehbaren Schaden.",
    "",
  ].filter((line) => line !== "");

  const widerruf = gewerbe
    ? [
        "§ 11 Widerruf",
        "Der Kunde handelt als Unternehmer. Ein Widerrufsrecht nach §§ 312g, 355 BGB besteht nicht,",
        "soweit kein Verbrauchergeschäft vorliegt.",
        "",
      ]
    : [
        "§ 11 Widerrufsrecht",
        "Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen.",
        "Die Frist beginnt mit Vertragsschluss. Erklärung per Brief oder E-Mail an info@e1direktvertrieb.de.",
        "Das Muster in Anlage 3 können Sie verwenden. Zur Frist reicht die rechtzeitige Absendung.",
        "Wir erstatten Zahlungen spätestens binnen 14 Tagen.",
        "War die Lieferung auf Wunsch schon in der Frist begonnen, zahlen Sie den Anteil bis zum Widerruf.",
        "",
      ];

  const rest = [
    "§ 12 Datenschutz",
    "Verantwortlich: E1 Direktvertrieb, info@e1direktvertrieb.de.",
    "Verarbeitet werden Stammdaten, Lieferstelle, Verbrauch, Vertrag, Bank- und Kommunikationsdaten",
    "für Anbahnung, Durchführung, Abrechnung und gesetzliche Pflichten (Art. 6 Abs. 1 lit. b und c DSGVO).",
    "Empfänger: Lieferant, Netzbetreiber, Messstellenbetreiber, Zahlungsdienstleister, IT in der EU.",
    "Speicher: Laufzeit plus gesetzliche Aufbewahrung, in der Regel 6 bis 10 Jahre.",
    "Rechte: Auskunft, Berichtigung, Löschung, Einschränkung, Widerspruch, Beschwerde bei der Aufsicht.",
    "Einzelheiten: e1direktvertrieb.de/datenschutz",
    "",
    "§ 13 Streitbeilegung",
    gewerbe
      ? "Für Unternehmer gilt die Schlichtungsstelle Energie nicht als Pflichtverfahren."
      : "Verbraucher: Schlichtungsstelle Energie e. V., Friedrichstraße 133, 10117 Berlin, www.schlichtungsstelle-energie.de.",
    gewerbe ? "Es gilt der Rechtsweg." : "Zudem Verbraucherservice der Bundesnetzagentur. ODR: https://ec.europa.eu/consumers/odr/",
    "",
    "§ 14 Schlussbestimmungen",
    "Recht der Bundesrepublik Deutschland.",
    gewerbe
      ? "Gerichtsstand ist der Sitz von E1 bzw. der Liefergesellschaft, soweit der Kunde Kaufmann ist."
      : "Gerichtsstand nach den gesetzlichen Vorschriften.",
    "Mündliche Nebenabreden bestehen nicht. Änderungen in Textform.",
    "Unwirksame Klauseln lassen den übrigen Vertrag bestehen.",
    "Anlage 1 Preisblatt. Anlage 2 AGB. Anlage 3 Widerruf" + (gewerbe ? " (nur falls Verbraucher)." : "."),
    "",
    "Ort, Datum: ______________________________",
    "",
    "Unterschrift Kunde:  /sign1/",
    "Unterschrift Berater:  /sign2/",
    "",
    ...agbBlock(gewerbe),
    "",
    ...(gewerbe ? gewerbeHinweis() : widerrufFormular(d)),
  ];

  return [...kopf, ...widerruf, ...rest];
}

function gewerbeHinweis(): string[] {
  return [
    "ANLAGE 3  HINWEIS UNTERNEHMER",
    "Dieser Vertrag wird als Geschäftskunde geschlossen.",
    "Ein gesetzliches Widerrufsrecht für Verbraucher greift nicht.",
    "Preise verstehen sich netto zuzüglich gesetzlicher USt, soweit ausgewiesen.",
  ];
}

export function agbBlock(gewerbe = false): string[] {
  return [
    "ANLAGE 2 — ALLGEMEINE GESCHÄFTSBEDINGUNGEN",
    "E1 Direktvertrieb (Stand: Entwurf)",
    "",
    "1. Geltungsbereich",
    gewerbe
      ? "Diese AGB gelten für Energieverträge mit Unternehmern in Deutschland."
      : "Diese AGB gelten für Beratung, Vermittlung und Belieferung gegenüber Verbrauchern in Deutschland.",
    "",
    "2. Kein Callcenter, persönliche Beratung",
    "E1 berät persönlich vor Ort oder nach Termin. Es besteht kein Kaufzwang.",
    "Der Vertrag kommt erst mit Unterschrift (Tablet oder DocuSign) und Annahme zu Stande.",
    "",
    "3. Vermittlung über New Sales",
    "Solange eigene Tarife nicht freigegeben sind, erfolgt der Abschluss über den",
    "Partner New Sales beim jeweiligen Lieferanten. E1 schuldet die ordnungsgemäße",
    "Aufnahme der Daten und die Weiterleitung, nicht die Netzdienstleistung.",
    "",
    "4. Mitwirkung",
    "Der Kunde erteilt richtige Angaben zu Verbrauch, Zähler und Bankverbindung.",
    "Falschangaben können zum Rücktritt oder zur Nachberechnung führen.",
    "",
    "5. Provision / Unentgeltlichkeit für den Haushaltskunden",
    "Die Beratung ist für den Haushaltskunden unentgeltlich. Eine Vergütung erhält",
    "E1 vom Lieferanten bzw. Partner, nicht vom Kunden, sofern nicht ausdrücklich",
    "etwas anderes in Textform vereinbart wird.",
    "",
    "6. Widerruf, Storno",
    "Das Widerrufsrecht nach § 11 des Vertrags bleibt unberührt. Gesetzliche",
    "Widerrufs- und Kündigungsrechte können nicht zum Nachteil des Kunden verkürzt werden.",
    "",
    "7. Haftung der Beratung",
    "E1 wählt Tarife mit kaufmännischer Sorgfalt. Eine Garantie, dass ein Tarif",
    "dauerhaft der günstigste am Markt ist, wird nicht übernommen. Unberührt bleibt",
    "die Haftung nach § 10 des Vertrags.",
    "",
    "8. Datenschutz und Vertraulichkeit",
    "Es gilt die Datenschutzerklärung. Mitarbeiter und Partner sind auf Vertraulichkeit",
    "verpflichtet.",
    "",
    "9. Änderung der AGB",
    "Änderungen werden mitgeteilt. Widerspricht der Kunde nicht binnen sechs Wochen,",
    "gelten sie als genehmigt, sofern in der Mitteilung darauf hingewiesen wurde.",
    "Bei Widerspruch gelten die bisherigen AGB; ein Sonderkündigungsrecht bleibt unberührt.",
    "",
    "10. Salvatorische Klausel, Recht",
    "Deutsches Recht. Unwirksame Klauseln werden durch die gesetzliche Regelung ersetzt.",
  ];
}

export function widerrufFormular(d: VertragData): string[] {
  return [
    "ANLAGE 3 — MUSTER-WIDERRUFSFORMULAR",
    "(Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular",
    "aus und senden Sie es zurück.)",
    "",
    "An: E1 Direktvertrieb, info@e1direktvertrieb.de",
    "",
    "Hiermit widerrufe(n) ich/wir den von mir/uns abgeschlossenen Vertrag über",
    `die Lieferung von ${d.art === "gas" ? "Gas" : "Strom"}.`,
    `Bestellt am / erhalten am: ${dash(d.start, "[Datum]")}`,
    `Name: ${dash(d.first, "[Vorname]")} ${dash(d.last, "[Nachname]")}`,
    `Anschrift: ${dash(d.street, "[Straße]")} ${dash(d.house, "[Nr.]")} ${dash(d.zip, "[PLZ]")} ${dash(d.city, "[Ort]")}`,
    "Unterschrift (nur bei Mitteilung auf Papier): ______________  Datum: ________",
  ];
}

export function requiredClauses(): string[] {
  return [
    "Widerrufsrecht",
    "SEPA",
    "Datenschutz",
    "Schlichtungsstelle",
    "EnWG",
    "Platzhalter",
    "/sign1/",
  ];
}
