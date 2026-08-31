-- Live-Betrieb: New-Sales-Paket (keine API), Qualität automatisch, Folge/Bestand, 2FA-Pflicht

create table if not exists handovers (
  id text primary key,
  contract_id text not null references contracts(id) on delete cascade,
  channel text not null default 'paket_mail',
  recipient text not null,
  package_text text not null,
  status text not null default 'gesendet',
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists handovers_contract_idx on handovers (contract_id, created_at desc);

insert into settings (key, value) values
  ('require_2fa', 'admins'),
  ('newsales_handover_to', 'business@e1direktvertrieb.de'),
  ('quality_warn_rate', '0.25'),
  ('quality_block_rate', '0.40'),
  ('upload_backend', 'database_plus_disk')
on conflict (key) do nothing;

insert into commissions (id, contract_id, user_id, amount, type, status, note)
select 'cm-folge-ctr-3', 'ctr-3', 'demo-vt-keller', 50, 'folge', 'offen', 'Folgeprovision bei Belieferung'
where not exists (select 1 from commissions where contract_id = 'ctr-3' and type = 'folge');

insert into commissions (id, contract_id, user_id, amount, type, status, note)
select 'cm-bestand-ctr-9', 'ctr-9', 'demo-vt-keller', 15, 'bestand', 'offen', 'Bestandsprovision bei Abrechnung'
where not exists (select 1 from commissions where contract_id = 'ctr-9' and type = 'bestand');

insert into knowledge_articles (id, slug, title, category, body, required) values
  ('ka-9', 'newsales-uebergabe', 'Übergabe an New Sales', 'Prozess', E'New Sales hat keine API. Bei Status „Übermittelt“ erzeugt das Portal ein Übergabepaket und legt es:
- als Dokument am Auftrag
- als Mail an business@ (oder die hinterlegte Adresse)
- in der Tabelle handovers als Protokoll

Backoffice setzt den Auftrag auf Bestätigt, sobald New Sales den Vorgang angenommen hat.', true)
on conflict (id) do nothing;
