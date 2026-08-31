-- Echtes Firmenpostfach: Threads, Nachrichten, Anhänge, Sync, ACL

create table if not exists mailbox_threads (
  id text primary key,
  mailbox text not null,
  gmail_thread_id text,
  subject text not null default '',
  snippet text not null default '',
  folder text not null default 'inbox',
  last_at timestamptz not null default now(),
  unread_count integer not null default 0,
  starred boolean not null default false,
  customer_id text,
  contract_id text,
  lead_id text,
  application_id text,
  match_reason text,
  created_at timestamptz not null default now()
);

create index if not exists mailbox_threads_box_idx on mailbox_threads (mailbox, folder, last_at desc);

create table if not exists mailbox_messages (
  id text primary key,
  thread_id text not null references mailbox_threads(id) on delete cascade,
  mailbox text not null,
  gmail_id text,
  direction text not null,
  from_address text not null,
  from_name text not null default '',
  to_addresses text not null default '',
  cc_addresses text not null default '',
  subject text not null default '',
  body_text text not null default '',
  snippet text not null default '',
  folder text not null default 'inbox',
  unread boolean not null default false,
  draft boolean not null default false,
  in_reply_to text,
  sent_at timestamptz not null default now(),
  created_by text,
  status text not null default 'received'
);

create index if not exists mailbox_messages_thread_idx on mailbox_messages (thread_id, sent_at);
create unique index if not exists mailbox_messages_gmail_idx on mailbox_messages (mailbox, gmail_id) where gmail_id is not null;

create table if not exists mailbox_attachments (
  id text primary key,
  message_id text not null references mailbox_messages(id) on delete cascade,
  filename text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes integer not null default 0,
  content_base64 text,
  gmail_attachment_id text
);

create table if not exists mailbox_acl (
  id text primary key,
  local_part text not null,
  user_id text,
  role text,
  can_read boolean not null default true,
  can_send boolean not null default false
);

create table if not exists mailbox_sync (
  mailbox text primary key,
  history_id text,
  last_sync_at timestamptz,
  last_error text
);

insert into feature_flags (key, enabled, label, description, phase) values
  ('workspace_inbox', true, 'Firmenpostfach', 'Senden und Empfangen im Portal über Gmail API. Shared-Postfächer nur mit Recht.', '1')
on conflict (key) do nothing;

-- Seed: live-feeling inbox for preview
insert into mailbox_threads (id, mailbox, subject, snippet, folder, last_at, unread_count, customer_id, contract_id, match_reason) values
  ('mt-info-1', 'info', 'Lieferbeginn Stromvertrag', 'Wann startet mein Ökostrom genau? Die Bestätigung von New Sales habe ich noch nicht.', 'inbox', '2026-08-30 08:12:00+00', 1, 'cus-1', 'ctr-1', 'Kunden-E-Mail'),
  ('mt-info-2', 'info', 'Zählernummer zur Rechnung', 'Anbei die letzte Rechnung. Bitte die Zählernummer im Auftrag prüfen.', 'inbox', '2026-08-29 16:40:00+00', 0, 'cus-2', 'ctr-2', 'Kunden-E-Mail'),
  ('mt-info-3', 'info', 'Bitte Rückruf am Abend', 'Familie Dorn, Einfamilienhaus in 80331. Beratung gewünscht.', 'inbox', '2026-08-31 07:05:00+00', 1, null, null, 'Lead-Name'),
  ('mt-bew-1', 'bewerbung', 'Bewerbung Vertrieb', '5 Jahre Energievertrieb, suche ehrliches Modell ohne Druck.', 'inbox', '2026-08-28 11:20:00+00', 1, null, null, 'Bewerbung per Absender'),
  ('mt-bus-1', 'business', 'Kooperation Stadtwerke-Nähe', 'Wir suchen einen fairen Vertriebspartner in NRW. Passt E1?', 'inbox', '2026-08-27 09:00:00+00', 1, null, null, null),
  ('mt-info-d', 'info', 'Korrektur Zählernummer König', 'Entwurf: Bitte die Zählernummer aus der Rechnung nachtragen.', 'drafts', '2026-08-30 18:00:00+00', 0, 'cus-4', 'ctr-5', 'Kunden-E-Mail'),
  ('mt-keller-1', 'jonas.keller', 'Nachfrage Wärmepumpe', 'Herr Hartmann fragt nach dem WP-Tarif. Bitte intern klären.', 'inbox', '2026-08-30 12:10:00+00', 1, 'cus-5', 'ctr-7', 'Kunden-E-Mail')
on conflict (id) do nothing;

update mailbox_threads set lead_id = 'lead-1', match_reason = 'Lead-Name' where id = 'mt-info-3';
update mailbox_threads set application_id = 'app-1' where id = 'mt-bew-1';

insert into mailbox_messages (id, thread_id, mailbox, direction, from_address, from_name, to_addresses, subject, body_text, snippet, folder, unread, draft, sent_at, status) values
  ('mm-info-1a', 'mt-info-1', 'info', 'in', 'hans.mueller@example.de', 'Hans Müller', 'info@e1direktvertrieb.de', 'Lieferbeginn Stromvertrag', E'Guten Tag,\n\nich habe bei Ihnen Ökostrom 12 abgeschlossen (Auftrag ctr-1).\nWann startet die Lieferung genau? Eine Bestätigung von New Sales habe ich noch nicht.\n\nMit freundlichen Grüßen\nHans Müller\nKastanienallee 12, 10435 Berlin', 'Wann startet mein Ökostrom genau?', 'inbox', true, false, '2026-08-30 08:12:00+00', 'received'),
  ('mm-info-2a', 'mt-info-2', 'info', 'in', 'anna.schmidt@example.de', 'Anna Schmidt', 'info@e1direktvertrieb.de', 'Zählernummer zur Rechnung', E'Hallo E1,\n\nanbei die letzte Rechnung als Textauszug. Bitte die Zählernummer im Auftrag prüfen.\nZählernummer 1DE000223344, Leopoldstraße 44, 80802 München.\n\nAnna Schmidt', 'Anbei die letzte Rechnung.', 'inbox', false, false, '2026-08-29 15:02:00+00', 'received'),
  ('mm-info-2b', 'mt-info-2', 'info', 'out', 'info@e1direktvertrieb.de', 'E1 Direktvertrieb', 'anna.schmidt@example.de', 'Re: Zählernummer zur Rechnung', E'Guten Tag Frau Schmidt,\n\nvielen Dank. Die Zählernummer 1DE000223344 ist im Auftrag hinterlegt. Wir geben den Vorgang an New Sales weiter.\n\nHerzliche Grüße\nE1 Direktvertrieb', 'Die Zählernummer ist hinterlegt.', 'sent', false, false, '2026-08-29 16:40:00+00', 'sent'),
  ('mm-info-3a', 'mt-info-3', 'info', 'in', 'familie.dorn@example.de', 'Familie Dorn', 'info@e1direktvertrieb.de', 'Bitte Rückruf am Abend', E'Guten Tag,\nbitte Rückruf am Abend, Einfamilienhaus. Telefon 0172 4445566, PLZ 80331.\n\nFamilie Dorn', 'Bitte Rückruf am Abend, Einfamilienhaus.', 'inbox', true, false, '2026-08-31 07:05:00+00', 'received'),
  ('mm-bew-1a', 'mt-bew-1', 'bewerbung', 'in', 'felix.brandt@example.de', 'Felix Brandt', 'bewerbung@e1direktvertrieb.de', 'Bewerbung Vertrieb', E'Guten Tag Orhan, guten Tag Luca-Marco,\n\n5 Jahre Energievertrieb, suche ein ehrliches Modell ohne Druck. Mobil 0170 1112233.\n\nFreundliche Grüße\nFelix Brandt', '5 Jahre Energievertrieb, suche ehrliches Modell.', 'inbox', true, false, '2026-08-28 11:20:00+00', 'received'),
  ('mm-bus-1a', 'mt-bus-1', 'business', 'in', 'kooperation@stadtwerke-nahe.example', 'Vertriebskoordination', 'business@e1direktvertrieb.de', 'Kooperation Stadtwerke-Nähe', E'Guten Tag,\nwir suchen einen fairen Vertriebspartner in NRW. Passt E1 zu einem White-Label in 2027?\n\nMit freundlichen Grüßen', 'Wir suchen einen fairen Vertriebspartner in NRW.', 'inbox', true, false, '2026-08-27 09:00:00+00', 'received'),
  ('mm-info-d1', 'mt-info-d', 'info', 'out', 'info@e1direktvertrieb.de', 'E1 Direktvertrieb', 'claudia.koenig@example.de', 'Korrektur Zählernummer König', E'Guten Tag Frau König,\n\nbitte senden Sie uns die Zählernummer aus der letzten Rechnung, dann schließen wir die Korrektur ab.\n\nE1 Backoffice', 'Bitte die Zählernummer nachtragen.', 'drafts', false, true, '2026-08-30 18:00:00+00', 'draft'),
  ('mm-keller-1a', 'mt-keller-1', 'jonas.keller', 'in', 'jonas.hartmann@example.de', 'Jonas Hartmann', 'jonas.keller@e1direktvertrieb.de', 'Nachfrage Wärmepumpe', E'Hallo Herr Keller,\npasst der Wärmepumpenstrom zu unserem Haus in Stuttgart? Verbrauch ca. 2500 kWh plus WP.\n\nJonas Hartmann', 'Passt der Wärmepumpenstrom zu unserem Haus?', 'inbox', true, false, '2026-08-30 12:10:00+00', 'received')
on conflict (id) do nothing;

insert into mailbox_attachments (id, message_id, filename, mime_type, size_bytes, content_base64) values
  ('ma-1', 'mm-info-2a', 'rechnung-auszug.txt', 'text/plain', 92, 'WmFobGVycnVtbWVyIDEERTAwMDIyMzM0NAogSmFocmVzdmVyYnJhdWNoIDQxMDAga1doCkxlb3BvbGRzdHJhw59lIDQ0LCA4MDgwMiBNw7xuY2hlbg==')
on conflict (id) do nothing;

insert into mailbox_sync (mailbox, last_sync_at, last_error) values
  ('info', null, 'Noch kein Gmail-Token. Postfach läuft lokal, Sync sobald Admin SDK verbunden ist.'),
  ('bewerbung', null, null),
  ('business', null, null)
on conflict (mailbox) do nothing;

insert into knowledge_articles (id, slug, title, category, body, required) values
  ('ka-8', 'firmenpostfach', 'Firmenpostfach im Portal', 'Produkt', E'Das Portal ist das Firmenpostfach. Kein reines Hinweis-System.

Persönlich: vorname.nachname@e1direktvertrieb.de — jeder sendet und empfängt nur das eigene Konto.
Shared, nur mit Recht:
- info@ Beratung
- bewerbung@ Karriere
- business@ Partner

Funktionen: Posteingang, Gesendet, Entwürfe, Antworten, Weiterleiten, Anhänge in beide Richtungen.
Eingehende Mails werden Kunden, Aufträgen, Leads oder Bewerbungen zugeordnet, wenn Absender, Auftragsnummer, Name/PLZ oder Telefon erkennbar sind.

Live-Sync über die Gmail API der Domain. Ohne Service-Account bleibt der lokale Bestand, Website-Anfragen landen trotzdem im Posteingang.', true)
on conflict (id) do nothing;
