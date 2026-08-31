/** Deutsche Energieverträge mit Platzhaltern, bis Preise und Lieferant feststehen. */

export const PRICE_PLACEHOLDER = "—,—";

export type VertragArt = "strom" | "gas";

export type VertragData = {
  art: VertragArt;
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
};

export function dash(v?: string | null, fallback = PRICE_PLACEHOLDER) {
  const s = (v ?? "").trim();
  return s || fallback;
}

export function fillVertrag(d: VertragData): string[] {
  const energie = d.art === "gas" ? "Gas (Erdgas)" : "Strom (elektrische Energie)";
  const gvv = d.art === "gas" ? "GasGVV" : "StromGVV";
  const ap = dash(d.arbeitspreis, `${PRICE_PLACEHOLDER} ct/kWh (Platzhalter bis Tariffreigabe)`);
  const gp = dash(d.grundpreis, `${PRICE_PLACEHOLDER} €/Monat (Platzhalter bis Tariffreigabe)`);
  const lieferant = dash(
    d.lieferant,
    "der vermittelte Lieferant (über New Sales / nach Freigabe eigener E1-Tarif)",
  );
  const laufzeit = dash(d.laufzeitMonate, "12");
  const start = dash(d.start, "nächstmöglicher Lieferbeginn nach Widerrufsfrist und Netzabmeldung");
  const iban = dash(d.iban, "[IBAN — Platzhalter]");
  const inhaber = dash(d.owner, `${d.first} ${d.last}`.trim() || "[Kontoinhaber]");

  return [
    "E1 DIREKTVERTRIEB",
    "Energie, die zu Ihnen passt.",
    "",
    d.art === "gas" ? "GASLIEFERVERTRAG" : "STROMLIEFERVERTRAG",
    "Haushaltskunde  |  Fernabsatz- und Haustürgeschäft  |  deutsches Recht",
    "",
    "Muster / Vertragsurkunde. Preise, Lieferant, Handelsregister und Gläubiger-ID",
    "sind Platzhalter, bis Tarif und Gesellschaftsangaben freigegeben sind.",
    "Widerrufsbelehrung, SEPA, Datenschutz und Schlichtung sind enthalten.",
    "",
    "§ 1 Vertragsparteien",
    `Kunde: ${dash(d.first, "[Vorname]")} ${dash(d.last, "[Nachname]")}`,
    `Anschrift der Lieferstelle: ${dash(d.street, "[Straße]")} ${dash(d.house, "[Nr.]")} ${dash(d.zip, "[PLZ]")} ${dash(d.city, "[Ort]")}`,
    `Telefon: ${dash(d.phone, "[Telefon]")}   E-Mail: ${dash(d.email, "[E-Mail]")}`,
    d.birth ? `Geburtsdatum: ${d.birth}` : "Geburtsdatum: [Platzhalter]",
    "",
    "Vermittler / Vertrieb:",
    "E1 Direktvertrieb, Geschäftsführung Orhan Salo und Luca Marco Marrancone",
    "E-Mail: info@e1direktvertrieb.de",
    "Anschrift der operativen Gesellschaft: [Straße, PLZ, Ort — Platzhalter § 5 DDG]",
    "Registergericht / HRB: [Platzhalter]    USt-IdNr.: [Platzhalter]",
    "",
    `Lieferant: ${lieferant}`,
    "E1 vermittelt den Abschluss und dokumentiert den Auftrag. Sobald eigene E1-Tarife",
    "freigegeben sind, tritt E1 bzw. die dann benannte Liefergesellschaft als Lieferant ein.",
    "",
    "§ 2 Gegenstand",
    `Gegenstand ist die Belieferung der genannten Lieferstelle mit ${energie}`,
    "für den eigenen Haushaltsbedarf im Niederspannungs- bzw. Niederdrucknetz.",
    "Es gelten die gesetzlichen Regelungen des EnWG, der jeweiligen Netzzugangsverordnungen",
    `sowie ergänzend ${gvv}, soweit nicht abweichend vereinbart.`,
    `Produkt / Tarif: ${dash(d.product, "[Tarifname — Platzhalter]")}`,
    `Zählernummer: ${dash(d.meter, "[wird nachgereicht / New Sales]")}`,
    `Bisheriger Lieferant: ${dash(d.previous, "[falls bekannt]")}`,
    `Voraussichtlicher Jahresverbrauch: ${dash(d.kwh, "[kWh]")} kWh`,
    `Berater vor Ort: ${dash(d.advisor, "[Berater]")}`,
    "",
    "§ 3 Lieferbeginn",
    `Gewünschter Lieferbeginn: ${start}.`,
    "Die Lieferung beginnt, sobald der Netzbetreiber den Wechsel bestätigt und die",
    "Widerrufsfrist abgelaufen ist, sofern nicht ausdrücklich auf das Widerrufsrecht",
    "verzichtet wurde (ein solcher Verzicht wird hier nicht vereinbart).",
    "",
    "§ 4 Preise (EnWG § 41 — Transparenz)",
    `Arbeitspreis (netto): ${ap}`,
    `Grundpreis (netto): ${gp}`,
    "Hinzu kommen in gesetzlicher Höhe: Umsatzsteuer, Strom- bzw. Energiesteuer,",
    "Netzentgelte, Messstellenbetrieb, Umlagen und Abgaben (u. a. KWKG, Offshore,",
    "§ 19 StromNEV, Konzessionsabgabe — jeweils in der bei Lieferung geltenden Höhe).",
    "Die konkreten Beträge werden bei Tariffreigabe in dieses Dokument eingesetzt",
    "und dem Kunden vor Unterschrift vollständig genannt (Preisblatt Anlage 1).",
    "Neukundenbonus / Sofortbonus: [Platzhalter — 0,00 €, sofern nicht ausgewiesen].",
    "",
    "§ 5 Preisänderungen",
    "Preisänderungen sind nur nach den gesetzlichen Vorgaben zulässig und werden",
    "mindestens einen Monat im Voraus in Textform mitgeteilt. Der Kunde kann bei",
    "einer Änderung, die nicht ausschließlich Steuern, Umlagen oder Netzentgelte",
    "betrifft, den Vertrag ohne Einhaltung einer Frist zum Zeitpunkt des Wirksamwerdens",
    "der Änderung kündigen (Sonderkündigungsrecht).",
    "",
    "§ 6 Laufzeit und Kündigung",
    `Erstlaufzeit: ${laufzeit} Monate ab Lieferbeginn.`,
    "Kündigungsfrist: ein Monat zum Ablauf der Erstlaufzeit. Wird nicht gekündigt,",
    "verlängert sich der Vertrag auf unbestimmte Zeit und ist dann monatlich kündbar.",
    "Kündigung in Textform an info@e1direktvertrieb.de oder an den Lieferanten.",
    "Ein Umzug ist unverzüglich anzuzeigen; es gelten die gesetzlichen Rechte.",
    "",
    "§ 7 Abrechnung, Zählerstände, Messung",
    "Abgerechnet wird in der Regel jährlich, zuzüglich gesetzlich zulässiger Abschläge.",
    "Zählerstände teilt der Kunde auf Anforderung mit oder sie werden vom Messstellenbetreiber",
    "übermittelt. Einwände gegen Rechnungen berechtigen nicht zur Zahlungsverweigerung,",
    "soweit nicht offensichtlich Fehler vorliegen.",
    "",
    "§ 8 Zahlung, SEPA-Lastschrift",
    "Rechnungsbeträge sind mit Zugang fällig. Bevorzugt: SEPA-Basislastschrift.",
    `Kontoinhaber: ${inhaber}`,
    `IBAN: ${iban}`,
    "Gläubiger-Identifikationsnummer: [Platzhalter — DE__ZZZ___________]",
    "Mandatsreferenz: wird nach Vertragsnummer vergeben.",
    "Der Kontoinhaber ermächtigt den Lieferanten, fällige Beträge einzuziehen, und",
    "weist sein Kreditinstitut an, die Lastschriften einzulösen. Innerhalb von acht",
    "Wochen, beginnend mit dem Belastungsdatum, kann die Erstattung des belasteten",
    "Betrags verlangt werden. Es gelten die mit dem Kreditinstitut vereinbarten Bedingungen.",
    "",
    "§ 9 Pflichten des Kunden",
    "Der Kunde stellt den Zugang zur Messeinrichtung sicher, teilt Änderungen der",
    "Anschrift, Bankverbindung und des Verbrauchsverhaltens unverzüglich mit und",
    "nutzt die Energie nicht unberechtigt weiter.",
    "",
    "§ 10 Haftung",
    "Bei Unterbrechung oder Unregelmäßigkeiten in der Energieversorgung gelten die",
    "gesetzlichen Haftungsregeln (u. a. gegenüber dem Netzbetreiber). E1 und der",
    "Lieferant haften unbeschränkt bei Vorsatz, grober Fahrlässigkeit und bei",
    "Verletzung von Leben, Körper und Gesundheit. Bei leichter Fahrlässigkeit nur",
    "für wesentliche Vertragspflichten, begrenzt auf den vorhersehbaren Schaden.",
    "",
    "§ 11 Widerrufsrecht (Haustür- und Fernabsatzgeschäft)",
    "Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen",
    "Vertrag zu widerrufen. Die Frist beginnt mit Vertragsschluss. Um Ihr",
    "Widerrufsrecht auszuüben, müssen Sie uns mittels einer eindeutigen Erklärung",
    "(Brief oder E-Mail an info@e1direktvertrieb.de) informieren. Die Muster-",
    "Widerrufsformulierung am Ende dieses Dokuments können Sie verwenden.",
    "Zur Wahrung der Frist genügt die rechtzeitige Absendung.",
    "Folgen: Wir erstatten alle Zahlungen unverzüglich, spätestens binnen 14 Tagen.",
    "Haben Sie verlangt, dass die Lieferung während der Widerrufsfrist beginnen soll,",
    "zahlen Sie einen angemessenen Betrag für die bis zum Widerruf gelieferte Energie.",
    "",
    "§ 12 Datenschutz",
    "Verantwortlich: E1 Direktvertrieb, info@e1direktvertrieb.de.",
    "Verarbeitet werden Stammdaten, Lieferstelle, Verbrauchs- und Vertragsdaten,",
    "Bankdaten zur Lastschrift sowie Kommunikationsdaten, soweit für Anbahnung,",
    "Durchführung und Abrechnung des Vertrags und für gesetzliche Pflichten nötig",
    "(Art. 6 Abs. 1 lit. b und c DSGVO). Empfänger: Lieferant, Netzbetreiber,",
    "Messstellenbetreiber, Zahlungsdienstleister, IT-Auftragsverarbeiter in der EU.",
    "Speicherdauer: Vertragslaufzeit plus gesetzliche Aufbewahrung (i. d. R. 6–10 Jahre).",
    "Rechte: Auskunft, Berichtigung, Löschung, Einschränkung, Widerspruch, Beschwerde",
    "bei einer Aufsichtsbehörde. Einzelheiten: e1direktvertrieb.de/datenschutz",
    "",
    "§ 13 Streitbeilegung",
    "Für Verbraucher: Schlichtungsstelle Energie e. V., Friedrichstraße 133, 10117 Berlin,",
    "www.schlichtungsstelle-energie.de. Zuständig ist zudem der Verbraucherservice",
    "der Bundesnetzagentur. E1 ist zur Teilnahme an einem Schlichtungsverfahren verpflichtet,",
    "soweit E1 oder der Lieferant Energielieferant im Sinne des EnWG ist.",
    "Online-Streitbeilegung: https://ec.europa.eu/consumers/odr/",
    "",
    "§ 14 Schlussbestimmungen",
    "Es gilt das Recht der Bundesrepublik Deutschland. Gerichtsstand für Kaufleute ist",
    "der Sitz der Liefergesellschaft, sobald dieser im Impressum genannt ist.",
    "Sollten einzelne Klauseln unwirksam sein, bleibt der Vertrag im Übrigen wirksam.",
    "Mündliche Nebenabreden bestehen nicht. Änderungen in Textform.",
    "Anlage 1 Preisblatt (Platzhalter) · Anlage 2 AGB · Anlage 3 Widerrufsformular.",
    "",
    "Ort, Datum: ______________________________",
    "",
    "Unterschrift Kunde (DocuSign-Anker):  /sign1/",
    "",
    "Unterschrift Berater (optional):  /sign2/",
    "",
    ...agbBlock(),
    "",
    ...widerrufFormular(d),
  ];
}

export function agbBlock(): string[] {
  return [
    "ANLAGE 2 — ALLGEMEINE GESCHÄFTSBEDINGUNGEN",
    "E1 Direktvertrieb (Stand: Entwurf)",
    "",
    "1. Geltungsbereich",
    "Diese AGB gelten für die Beratung und Vermittlung von Energieverträgen sowie,",
    "nach Freigabe, für die Belieferung mit Strom und Gas durch E1 bzw. die benannte",
    "Liefergesellschaft gegenüber Verbrauchern in Deutschland.",
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
