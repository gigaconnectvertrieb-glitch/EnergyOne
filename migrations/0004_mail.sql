-- E-Mail-Sicherheit: Domain, Absender, Prüfstatus (SPF / DKIM / DMARC)

create table if not exists mail_domains (
  id text primary key,
  domain text not null unique,
  provider text not null default 'microsoft365',
  dmarc_policy text not null default 'none',
  report_to text not null default 'dmarc@e1direktvertrieb.de',
  spf_status text not null default 'fehlt',
  dkim_status text not null default 'fehlt',
  dmarc_status text not null default 'fehlt',
  last_checked_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists mail_identities (
  id text primary key,
  domain_id text not null references mail_domains(id),
  local_part text not null,
  display_name text not null,
  kind text not null,
  purpose text not null default '',
  active boolean not null default true,
  unique (domain_id, local_part)
);

create table if not exists mail_send_log (
  id text primary key,
  from_address text not null,
  purpose text not null,
  allowed boolean not null,
  reason text,
  created_by text,
  created_at timestamptz not null default now()
);

insert into mail_domains (id, domain, provider, dmarc_policy, report_to, spf_status, dkim_status, dmarc_status, notes)
values (
  'mail-e1',
  'e1direktvertrieb.de',
  'microsoft365',
  'none',
  'dmarc@e1direktvertrieb.de',
  'fehlt',
  'fehlt',
  'fehlt',
  'DNS-Einträge beim Domain-Registrar und im Microsoft 365- oder Google-Workspace-Admin setzen. Versand ist gesperrt, bis SPF, DKIM und DMARC auf ok stehen.'
)
on conflict (id) do nothing;

insert into mail_identities (id, domain_id, local_part, display_name, kind, purpose) values
  ('mi-info', 'mail-e1', 'info', 'E1 Direktvertrieb', 'company', 'Allgemeine Anfragen, Website'),
  ('mi-bewerbung', 'mail-e1', 'bewerbung', 'E1 Karriere', 'company', 'Bewerbungen und Onboarding'),
  ('mi-business', 'mail-e1', 'business', 'E1 Business', 'company', 'Partner, B2B, Kooperationen'),
  ('mi-dmarc', 'mail-e1', 'dmarc', 'E1 DMARC Reports', 'reports', 'rua/ruf Aggregate- und Forensik-Reports'),
  ('mi-system', 'mail-e1', 'system', 'E1 System', 'system', 'Portal-Mails (Aufträge, Freigaben, Hinweise)'),
  ('mi-orhan', 'mail-e1', 'orhan.salo', 'Orhan Salo', 'personal', 'Geschäftsführung'),
  ('mi-luca', 'mail-e1', 'luca-marco.marrancone', 'Luca-Marco Marrancone', 'personal', 'Geschäftsführung')
on conflict (id) do nothing;

insert into knowledge_articles (id, slug, title, category, body, required) values
  ('ka-7', 'mail-sicherheit', 'E-Mail-Sicherheit (SPF, DKIM, DMARC)', 'Compliance', E'Nur authentifizierte Server dürfen als @e1direktvertrieb.de senden.\n\nSPF: Welche Server dürfen senden? Hartes -all, kein ~all.\nDKIM: Jede Mail wird kryptografisch signiert.\nDMARC: Empfänger wissen, was bei Fälschungen passiert.\n\nStart-Policy: p=none (Reports sammeln).\nDanach: p=quarantine, dann p=reject.\n\nReports: dmarc@e1direktvertrieb.de plus die Gründer-Postfächer.\nGilt für info@, bewerbung@, business@, system@ und vorname.nachname@.\n\nOhne ok bei SPF, DKIM und DMARC gibt es keinen Versand – auch nicht testweise.', true)
on conflict (id) do nothing;
