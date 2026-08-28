# Agentur-Zentrale

Interne Steuerzentrale für Strom- und Gasagenturen. newSales kann weiterhin die Vertragsquelle bleiben; diese Anwendung bündelt die Agenturorganisation: Rollen-Login, Kunden, Verträge/PDFs, Rechnungen, Preise, Aufgaben, Teams, Mitarbeiterplanung, News, Incentives, Provisionen, Ausgaben, Geschäftsführungszahlen, Aktivitätsprotokoll, CSV-Export und einen täglichen Mahnlauf.

## Start

1. Kopieren Sie `.env.example` nach `.env` und setzen Sie mindestens `JWT_SECRET` sowie das Admin-Passwort.
2. Führen Sie `docker-compose up --build` aus.
3. Öffnen Sie `http://localhost:8000`.

Startzugang: `admin@ihre-agentur.de` / `admin123`. Ändern Sie ihn vor dem Produktiveinsatz durch Anlegen eines neuen Administrators bzw. direkt in der Datenbank.

## Betrieb

Die OpenAPI-Entwicklerdokumentation ist unter `/docs`. PDFs liegen im Container unter `/app/storage`; das Docker-Volume `storage` hält sie persistent. Für produktiven externen Betrieb ersetzen Sie die Datenbank durch eine verwaltete PostgreSQL-Instanz, setzen Sie ein starkes JWT-Secret und legen Sie einen Reverse Proxy/HTTPS vor den Dienst.

## Agentur-Steuerung

Das Geschäftsführungs-Dashboard ist unter `GET /api/agency/overview`; Teamzahlen sind unter `GET /api/agency/leaderboard`. Einzelne Mitarbeiterzahlen mit Soll/Ist, Prozent-Zielerreichung und Ampel (`gruen`, `gelb`, `rot`) liefert `GET /api/agency/scorecards`; dasselbe für Teams `GET /api/agency/team-scorecards`. Ziele legen Administratoren über `POST /api/goals` an. Die Backoffice-Funktionen sind in `/docs` vollständig aufgelistet. Provisionen werden nach einer als bezahlt markierten Rechnung mit `POST /api/commissions/calculate` erzeugt.

## Getrennte Portale

Mitarbeiter reichen Abschlüsse über `POST /api/employee/closures` ein und sehen ausschließlich eigene Einträge bzw. ihren Tageskalender unter `GET /api/employee/performance-calendar`. Die Geschäftsführung prüft alle Einträge unter `GET /api/admin/closures` und bestätigt/storniert diese mit `POST /api/admin/closures/{id}/review`. Der Teamkalender, nach Datum und Mitarbeiter gruppiert, ist ausschließlich für Admins unter `GET /api/admin/performance-calendar` sichtbar. Finanzdaten, Ausgaben und Auszahlungen bleiben ebenfalls auf Admin-/Buchhaltungsrollen begrenzt.

Für die einfache operative Erfassung gibt es außerdem genau eine Tagesmeldung: Mitarbeiter speichern Verträge, Stornos und eine optionale Bemerkung über `PUT /api/employee/daily-performance`. Das Mitarbeiter-Dashboard enthält hierfür Plus-/Minus-Schaltflächen. Admins sehen alle Tagesmeldungen und den Netto-Wert unter `GET /api/admin/daily-performance`.

## Schulungen und KI-Training

Admins legen Schulungen mit Termin, optionalem Meeting-Link und Teilnehmerlimit über `POST /api/trainings` an. Mitarbeiter sehen den Kalender mit `GET /api/trainings` und melden sich selbst an. Der Bereich liefert zudem geprüfte Pitch-/Einwandvorlagen unter `GET /api/training/pitches`. Mit `POST /api/training/practice` erhalten Mitarbeiter eine Einwandübung. Ist `OPENAI_API_KEY` gesetzt, wird sie serverseitig über die Responses API individuell formuliert; andernfalls liefert das System eine vorhandene Vorlage. Der Schlüssel bleibt ausschließlich in der Serverumgebung. Die OpenAI Responses API wird hierfür verwendet, wie in der [offiziellen OpenAI-Dokumentation](https://platform.openai.com/docs/quickstart/make-your-first-api-request) beschrieben.

Der EnergyOne Vertriebscoach ist ein spezialisierter Chat für Pitches, Einwände, Gesprächsstruktur, Nachfassen, Selbstorganisation und Zielarbeit. Der Verlauf ist pro Mitarbeiter getrennt und über `GET /api/training/coach/history` sichtbar; eine Nachricht wird über `POST /api/training/coach/chat` gesendet. Für API-Antworten ist `store=False` gesetzt, damit keine OpenAI-Responses-Anwendungsdaten gespeichert werden; der lokale Verlauf liegt ausschließlich in der Agentur-Datenbank.

## Externe Dienste

Die Umgebungsvariablen für DocuSign, SMTP und Twilio sind vorbereitet. Die lokale Kernfunktion läuft bewusst ohne diese Dienste. Für Versand bzw. DocuSign-Webhooks müssen die jeweiligen Zugangsdaten gesetzt und die Integrationsadapter ergänzt werden.
