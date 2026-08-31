-- Google Workspace is the only mail provider. Microsoft 365 is not used.

alter table mail_domains alter column provider set default 'google_workspace';

alter table mail_identities add column if not exists mailbox_type text not null default 'user';
alter table mail_identities add column if not exists workspace_status text not null default 'pending';
alter table mail_identities add column if not exists workspace_user_id text;
alter table mail_identities add column if not exists profile_user_id text;
alter table mail_identities add column if not exists delegates jsonb not null default '[]'::jsonb;

create table if not exists workspace_config (
  id text primary key,
  domain_id text not null references mail_domains(id),
  customer_id text,
  admin_email text,
  smtp_host text not null default 'smtp.gmail.com',
  smtp_port integer not null default 587,
  smtp_user text not null default 'system@e1direktvertrieb.de',
  gmail_api_enabled boolean not null default false,
  admin_sdk_enabled boolean not null default false,
  smtp_enabled boolean not null default false,
  connected boolean not null default false,
  last_sync_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists workspace_jobs (
  id text primary key,
  action text not null,
  local_part text not null,
  display_name text,
  profile_user_id text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists workspace_jobs_status_idx on workspace_jobs (status, created_at);

update mail_domains
set
  provider = 'google_workspace',
  notes = 'Google Workspace auf e1direktvertrieb.de. SPF include:_spf.google.com, DKIM google._domainkey, DMARC über denselben DNS. Kein Microsoft 365.'
where id = 'mail-e1';

-- Live founder mailbox is luca.marrancone@, not luca-marco.marrancone@
update mail_identities
set local_part = 'luca.marrancone',
    display_name = 'Luca-Marco Marrancone',
    mailbox_type = 'user',
    workspace_status = 'provisioned'
where domain_id = 'mail-e1' and local_part in ('luca-marco.marrancone', 'luca.marrancone');

update mail_identities
set mailbox_type = 'shared', workspace_status = 'shared'
where domain_id = 'mail-e1' and local_part in ('info', 'bewerbung', 'business');

update mail_identities
set mailbox_type = 'system', workspace_status = 'provisioned'
where domain_id = 'mail-e1' and local_part = 'system';

update mail_identities
set mailbox_type = 'reports', workspace_status = 'provisioned'
where domain_id = 'mail-e1' and local_part = 'dmarc';

update mail_identities
set mailbox_type = 'user', workspace_status = 'provisioned'
where domain_id = 'mail-e1' and local_part = 'orhan.salo';

insert into mail_identities (id, domain_id, local_part, display_name, kind, purpose, mailbox_type, workspace_status)
values (
  'mi-luca.marrancone',
  'mail-e1',
  'luca.marrancone',
  'Luca-Marco Marrancone',
  'personal',
  'Geschäftsführung',
  'user',
  'provisioned'
)
on conflict (domain_id, local_part) do update set
  display_name = excluded.display_name,
  mailbox_type = excluded.mailbox_type,
  workspace_status = excluded.workspace_status;

delete from mail_identities
where domain_id = 'mail-e1' and local_part = 'luca-marco.marrancone';

insert into workspace_config (
  id, domain_id, admin_email, smtp_user, notes
) values (
  'ws-e1',
  'mail-e1',
  'orhan.salo@e1direktvertrieb.de',
  'system@e1direktvertrieb.de',
  'Service-Account mit Domain-wide Delegation. Shared-Postfächer als Google Groups (Collaborative Inbox). Persönliche Konten über Admin SDK Directory.'
)
on conflict (id) do nothing;

insert into feature_flags (key, enabled, label, description, phase) values
  ('workspace_admin_sdk', false, 'Google Admin SDK', 'Mitarbeiter-Konten in Google Workspace automatisch anlegen und sperren. Erst einschalten, wenn der Service-Account hinterlegt ist.', '1'),
  ('workspace_gmail_api', false, 'Gmail API Versand', 'Portal-Mails (info@, bewerbung@, system@) über die Gmail API der Domain senden.', '1'),
  ('workspace_smtp', false, 'SMTP-Fallback', 'Fallback über smtp.gmail.com:587, falls die Gmail API nicht genutzt wird.', '1')
on conflict (key) do nothing;

insert into knowledge_articles (id, slug, title, category, body, required) values
  ('ka-7', 'mail-sicherheit', 'E-Mail über Google Workspace', 'Compliance', E'E1 nutzt ausschließlich Google Workspace auf e1direktvertrieb.de. Kein Microsoft 365.

Shared-Postfächer (Google Groups / Collaborative Inbox):
- info@e1direktvertrieb.de — Website und Beratung
- bewerbung@e1direktvertrieb.de — Karriere
- business@e1direktvertrieb.de — Partner und B2B

Persönlich:
- orhan.salo@e1direktvertrieb.de
- luca.marrancone@e1direktvertrieb.de
- Mitarbeiter: vorname.nachname@e1direktvertrieb.de

SPF: v=spf1 include:_spf.google.com -all
DKIM: google._domainkey aus der Admin-Konsole
DMARC: p=none, später quarantine, dann reject. Reports an dmarc@ plus die Gründer.

Wenn ein Mitarbeiter im Portal angelegt oder freigeschaltet wird, erzeugt das Portal einen Admin-SDK-Job (User anlegen). Bei Deaktivierung wird das Workspace-Konto gesperrt. Die automatische Ausführung hängt am Feature-Flag „Google Admin SDK“ und am Service-Account.

Ohne ok bei SPF, DKIM und DMARC gibt es keinen Versand — auch nicht testweise.', true)
on conflict (id) do update set body = excluded.body, title = excluded.title;
