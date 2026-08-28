# E1 Direktvertrieb · Vertriebsportal

Das eigene Vertriebsportal von E1 Direktvertrieb (Marke: EnergyOne). newSales bleibt die Vertragsquelle; dieses Portal bündelt die Agenturorganisation: TOTP-Login, Kunden, Verträge/PDFs, Rechnungen, Preise, Aufgaben, Teams, Mitarbeiterplanung, News, Incentives, Anbieter/Provisionsstaffeln, Provisionen & Stornoquoten, Ausgaben, Geschäftsführungszahlen, Aktivitätsprotokoll, CSV-Export, ein täglicher Mahnlauf sowie ein KI-Assistent mit echten Aktionsrechten.

## Start

1. Kopieren Sie `.env.example` nach `.env` und setzen Sie mindestens `JWT_SECRET` und `GENERAL_ACCESS_KEY` (Generalschlüssel für den Notfallzugang) auf eigene, zufällige Werte.
2. Führen Sie `docker-compose up --build` aus.
3. Öffnen Sie `http://localhost:8000`.

## Anmeldung (Google Authenticator)

Es gibt kein statisches Passwort mehr. Jeder Mitarbeiter (inklusive Admins) meldet sich mit `Benutzername` + aktuellem 6-stelligen Code aus Google Authenticator an.

- **Erster Start:** Ein Admin-Konto (`ADMIN_USERNAME`, Default `admin`) wird automatisch angelegt. Die TOTP-Einrichtungs-URL wird beim ersten Start ins Server-Log geschrieben (`docker-compose logs app` bzw. Render-Logs) — mit einem QR-Generator (z. B. `https://www.qr-code-generator.com`) einscannbar, oder die URL direkt in Google Authenticator einfügen.
- **Weitere Mitarbeiter:** Als Admin im Dashboard unter „Admin · Mitarbeiter" anlegen — der QR-Code zum Scannen wird direkt angezeigt.
- **Handy verloren / TOTP zurücksetzen:** Admin setzt im Dashboard unter „TOTP zurücksetzen" die Mitarbeiter-ID neu auf, neuer QR-Code wird angezeigt.
- **Generalschlüssel:** `GENERAL_ACCESS_KEY` funktioniert als Notfall-Code anstelle des TOTP-Codes für jeden Benutzernamen (z. B. wenn Google Authenticator nicht verfügbar ist). Kann als Admin im Dashboard unter „Admin · Generalschlüssel" geändert werden, ohne neu zu deployen. Jede Nutzung wird im Aktivitätsprotokoll vermerkt.

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
