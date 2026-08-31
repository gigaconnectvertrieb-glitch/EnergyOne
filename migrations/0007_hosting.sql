-- Render is the app host. Google Workspace is the mail system. No mailserver on Render.

update feature_flags
set enabled = false,
    label = 'SMTP (deaktiviert)',
    description = 'Kein Mailserver auf Render. Versand und Empfang nur über die Gmail API von Google Workspace.'
where key = 'workspace_smtp';

update feature_flags
set description = 'Portal-Mails senden und empfangen über die Gmail API. Render spricht mit Workspace, speichert keine Postfach-Passwörter.'
where key = 'workspace_gmail_api';

update feature_flags
set description = 'Mitarbeiter-Konten in Google Workspace anlegen und sperren. Bootstrap-Passwort geht nur an das Directory, nie in unsere Datenbank.'
where key = 'workspace_admin_sdk';

update workspace_config
set smtp_enabled = false,
    smtp_user = '',
    notes = 'Render hostet App und API. Google Workspace hält die Postfächer. Secrets nur in Render Environment Variables: GOOGLE_WORKSPACE_CLIENT_EMAIL, GOOGLE_WORKSPACE_PRIVATE_KEY, GOOGLE_WORKSPACE_ADMIN_EMAIL. Kein SMTP auf Render.'
where id = 'ws-e1';

update knowledge_articles
set body = E'Render hostet nur Portal und API. Google Workspace ist das Mailsystem. Kein Mailserver auf Render.

Der Server auf Render:
- Gmail API: senden und empfangen
- Admin SDK: User anlegen und sperren
- API-Keys nur in Render Environment Variables
- keine Mitarbeiter-Passwörter in unserer Datenbank
- Mails werden Kunde und Auftrag zugeordnet

Workspace hält die echten Postfächer:
- info@, bewerbung@, business@
- orhan.salo@, luca.marrancone@
- vorname.nachname@ für Mitarbeiter

SPF, DKIM und DMARC bleiben Pflicht, bevor Render im Namen der Domain senden darf.'
where id = 'ka-7';

update knowledge_articles
set body = E'Das Portal ist das Firmenpostfach, Workspace speichert die Mails.

Persönlich: vorname.nachname@e1direktvertrieb.de
Shared, nur mit Recht: info@, bewerbung@, business@

Render empfängt und sendet über die Gmail API im Auftrag des Portals.
Eingehende Mails werden Kunden, Aufträgen, Leads oder Bewerbungen zugeordnet.
Kein Mailserver und keine Postfach-Passwörter auf Render.'
where id = 'ka-8';
