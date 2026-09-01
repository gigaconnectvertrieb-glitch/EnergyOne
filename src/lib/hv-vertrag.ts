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
    "Gültig ab Vertragsbeginn. Beträge der Liste sind netto. Gesetzliche USt. (derzeit 19 %) kommt oben drauf, soweit keine Kleinunternehmerregelung greift.",
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
    "Beträge der Liste sind EUR netto. Gesetzliche USt. (derzeit 19 %) kommt oben drauf, soweit keine Kleinunternehmerregelung greift.",
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

export const E1_HV_ANSCHRIFT = "Neugasse 2a, 68649 Groß-Rohrheim";
export const E1_HV_TEL = "015678954406";

export function need(v?: string | null, label = "Angabe") {
  const s = (v ?? "").trim();
  if (!s || /^\[[^\]]+\]$/.test(s)) throw new Error(`${label} fehlt. Ein Platzhalter wird nicht in den Vertrag geschrieben.`);
  return s;
}

export function musterHvInput(): HvInput {
  return {
    first: "Max",
    last: "Mustermann",
    street: "Musterstraße",
    house: "1",
    zip: "68649",
    city: "Groß-Rohrheim",
    email: "max.mustermann@e1direktvertrieb.de",
    phone: "01700000000",
    staffId: "max.mustermann",
    birth: "01.01.1990",
    taxId: "DE000000000",
    tradeNo: "Gewerbe-000",
    start: "01.09.2026",
    region: "Rotation über das Portal",
    stufe: 1,
  };
}

export function dash(v?: string | null, fallback = "[Platzhalter]") {
  const s = (v ?? "").trim();
  return s || fallback;
}

export function fillHvVertrag(d: HvInput): string[] {
  const first = need(d.first, "Vorname");
  const last = need(d.last, "Nachname");
  const street = need(d.street, "Straße");
  const house = need(d.house, "Hausnummer");
  const zip = need(d.zip, "PLZ");
  const city = need(d.city, "Ort");
  const start = need(d.start, "Vertragsbeginn");
  const staff = need(d.staffId, "Mitarbeiter-ID");
  const email = need(d.email, "E-Mail");
  const phone = need(d.phone, "Telefon");
  const birth = need(d.birth, "Geburtsdatum");
  const tax = need(d.taxId, "Steuer-ID / USt-IdNr.");
  const trade = need(d.tradeNo, "Gewerbeanmeldung");
  const name = `${first} ${last}`;
  const addr = `${street} ${house}, ${zip} ${city}`;
  const stufe = Math.min(3, Math.max(1, Number(d.stufe) || 1));
  const deckel = "5.000";

  return [
    "Handelsvertretervertrag",
    "gemäß §§ 84 ff. HGB, kein Arbeitsverhältnis",
    "",
    "Unternehmer",
    `E1 Direktvertrieb, Inhaber: Orhan Salo und Luca-Marco Marrancone, ${E1_HV_ANSCHRIFT}, business@e1direktvertrieb.de, ${E1_HV_TEL}`,
    "",
    "Vertreter",
    `${name}, ${addr}, geb. ${birth}, Mitarbeiter-ID: ${staff}`,
    `Tel: ${phone}, E-Mail: ${email}`,
    `Steuer-ID/USt-IdNr.: ${tax}, Gewerbeanmeldung: ${trade}`,
    "",
    "Vertragsbeginn",
    start,
    "",
    "Gebiet",
    "Kein festes Gebiet. Rotierende Zuweisung durch den Unternehmer über das Portal.",
    "",
    "Stufe",
    `Stufe ${stufe}`,
    "",
    "1. Parteien und Rechtsverhältnis",
    "Dieser Vertrag wird zwischen dem Unternehmer und dem Vertreter als selbständigem Handelsvertreter im Sinne des § 84 Abs. 1 HGB geschlossen. Der Vertreter übt seine Tätigkeit im Wesentlichen frei und eigenverantwortlich aus, insbesondere in Bezug auf die Gestaltung seiner Arbeitszeit. Ein Arbeitsverhältnis wird durch diesen Vertrag nicht begründet. Der Vertreter ist für Steuern und soziale Absicherung selbst verantwortlich. Eine Anmeldung zur Sozialversicherung über den Unternehmer erfolgt nicht.",
    "",
    "2. Beginn, Vertragsdauer, Gebiet, Portalzugang",
    `Der Vertrag beginnt am ${start} und wird auf unbestimmte Zeit geschlossen. Dem Vertreter wird kein festes Vertriebsgebiet zugewiesen. Die Einsatzgebiete werden im Rotationsverfahren festgelegt und über das Portal mitgeteilt. Der Unternehmer stellt Zugang zum Vertriebsportal zur Verfügung.`,
    "",
    "3. Aufgaben des Vertreters",
    "Der Vertreter vermittelt im Namen und für Rechnung der vom Unternehmer benannten Energieversorger Strom- und Gaslieferverträge. Beratung wahrheitsgemäß nach EnWG, UWG und PAngV. Irreführende, unvollständige oder unter Druck erwirkte Angaben sind untersagt.",
    "",
    "4. Pflichten des Unternehmers",
    "Schulungsunterlagen, Produkt- und Preisinformationen, Portalzugang, Abrechnung nach Ziffer 9.",
    "",
    "5. Provision",
    "Höhe und Struktur stehen nicht in dieser Urkunde. Sie werden in einer gesonderten Provisionsordnung (Anlage A1) per E-Mail mitgeteilt. Änderungen in Textform gelten für danach vermittelte Verträge.",
    "",
    "6. Fälligkeit des Provisionsanspruchs",
    "Anspruch entsteht, wenn der Kundenvertrag bestätigt ist und die Widerrufsfrist von 14 Tagen (§ 355 BGB) ohne Widerruf verstrichen ist.",
    "",
    "7. Provisionsstufen",
    `Start Stufe ${stufe}. Höhere Stufen nur durch Zusatzvereinbarung in Textform.`,
    "",
    "8. Stornoregelung",
    "Widerruf des Kunden innerhalb von 14 Tagen: Provisionsanspruch entfällt vollständig. Danach Rückforderung nur bei nachgewiesener Pflichtverletzung des Vertreters.",
    "",
    "9. Abrechnung",
    "Monatlich über das Portal. Einwendungen binnen 14 Tagen nach Zugang, sonst anerkannt. Verrechnung von Vorschüssen und Rückforderungen zulässig.",
    "",
    "10. Vertraulichkeit",
    "Kundendaten, Geschäftsgeheimnisse und Konditionen vertraulich, auch nach Vertragsende.",
    "",
    "11. Wettbewerb während der Vertragslaufzeit",
    "Keine Vermittlung für Wettbewerber im Bereich Strom und Gas ohne vorherige schriftliche Zustimmung.",
    "",
    "12. Nachvertragliches Wettbewerbsverbot",
    "Nach § 90a HGB höchstens 24 Monate nach Vertragsende. Räumlich die in den letzten 12 Monaten bearbeiteten Einsatzgebiete. Gegenstand: Vermittlung von Strom- und Gaslieferverträgen. Wirksam nur schriftlich und mit Karenzentschädigung von mindestens der Hälfte der zuletzt bezogenen vertragsmäßigen Leistungen.",
    "",
    "13. Ordentliche Kündigung",
    "Nach § 89 HGB zum Monatsende: Jahr 1 ein Monat, Jahr 2 zwei Monate, Jahr 3 bis 5 drei Monate, ab Jahr 6 sechs Monate.",
    "",
    "14. Außerordentliche Kündigung",
    "Fristlos aus wichtigem Grund nach § 89a HGB bleibt unberührt.",
    "",
    "15. Ausgleichsanspruch",
    "§ 89b HGB bleibt. Ein Vorausverzicht vor Vertragsende ist unwirksam.",
    "",
    "16. Haftung",
    "Unbeschränkt bei Vorsatz, grober Fahrlässigkeit und Verletzung von Leben, Körper oder Gesundheit. Im Übrigen auf den vorhersehbaren, vertragstypischen Schaden beschränkt.",
    "",
    "17. Vertragsstrafe",
    `Bei schuldhafter schwerwiegender Pflichtverletzung (Falschberatung, eigenmächtige Preiszusagen) bis ${deckel} EUR je Verstoß. Weitergehender Schadensersatz bleibt.`,
    "",
    "18. Freistellung",
    "Der Vertreter stellt den Unternehmer von Ansprüchen Dritter frei, die auf schuldhafter Verletzung von UWG, EnWG oder DSGVO durch den Vertreter beruhen.",
    "",
    "19. Keine Vollmacht",
    "Kein Inkasso, keine verbindlichen Erklärungen im Namen des Unternehmers oder der Versorger, keine abweichenden Preise.",
    "",
    "20. Nachweise",
    "Vor Aufnahme: Gewerbeanmeldung, Ausweis, Steuernummer bzw. USt-IdNr., Bankverbindung. Berufshaftpflicht empfohlen.",
    "",
    "21. Herausgabe bei Vertragsende",
    "Unterlagen, Zugangsdaten und Werbemittel unverzüglich herausgeben. Portalzugang wird gesperrt.",
    "",
    "22. Datenschutz",
    "Verarbeitung nach Art. 6 DSGVO. Kundendaten nach Anlage A3.",
    "",
    "23. Anwendbares Recht und Gerichtsstand",
    "Deutsches Recht. Gerichtsstand, soweit zulässig, Sitz des Unternehmers.",
    "",
    "24. Schlussbestimmungen",
    "Änderungen in Textform. Unwirksame Klausel lässt den Rest bestehen. Anlagen A1 bis A3 sind Bestandteil.",
    "",
    "---PAGE---",
    "",
    "Anlage A2  Allgemeine Geschäftsbedingungen für Handelsvertreter",
    "",
    "1. Geltungsbereich. Diese AGB gelten ergänzend. Bei Widerspruch geht der Handelsvertretervertrag vor.",
    "2. Zusammenarbeit. Kommunikation vorrangig über das Portal. Erreichbarkeit für Rückfragen zu vermittelten Verträgen.",
    "3. Portal. Zugangsdaten nicht weitergeben. Verträge und Kundendaten vollständig und wahr im Portal erfassen.",
    "4. Werbung. Nur freigegebenes Material. Eigenes Material nur nach Freigabe.",
    "5. Kundenansprache. Ausweis bzw. Mitarbeiter-ID unaufgefordert. Ruhezeiten und Abbruchwunsch achten. Keine aggressiven Methoden.",
    "6. IT und Daten. Keine Kundendaten dauerhaft auf privaten Geräten. Details Anlage A3.",
    "7. Verstöße. Abmahnung, Portalsperre oder außerordentliche Kündigung nach § 89a HGB.",
    "8. Änderung der AGB. Mindestens vier Wochen vorher in Textform. Widerspruch erhält die alten AGB.",
    "9. Schluss. Deutsches Recht.",
    "",
    "---PAGE---",
    "",
    "Anlage A3  Datenschutzhinweis für Handelsvertreter (Art. 13 DSGVO)",
    "",
    `1. Verantwortlicher: E1 Direktvertrieb, Inhaber Orhan Salo und Luca-Marco Marrancone, ${E1_HV_ANSCHRIFT}, business@e1direktvertrieb.de.`,
    "2. Zwecke: Vertrag (Art. 6 Abs. 1 lit. b), Aufbewahrung (lit. c), Vertriebssteuerung (lit. f).",
    "3. Empfänger: Steuerberater, Portal-Auftragsverarbeiter, Energieversorger soweit nötig.",
    "4. Speicherdauer: Vertrag plus 6 bzw. 10 Jahre (§ 257 HGB, § 147 AO).",
    "5. Rechte: Art. 15 bis 21 DSGVO, Beschwerde bei der Aufsicht.",
    "6. Kundendaten nur zur Vermittlung, nur im Portal, Meldung von Verletzungen binnen 24 Stunden.",
    "7. Vertraulichkeit gilt nach Vertragsende fort.",
    "",
    "---PAGE---",
    "",
    "Ort, Datum: ________________",
    "",
    "E1 Direktvertrieb (Unternehmer)    /sign1/",
    "Orhan Salo / Luca-Marco Marrancone",
    "",
    `${name} (Vertreter)    /sign2/`,
  ];
}

