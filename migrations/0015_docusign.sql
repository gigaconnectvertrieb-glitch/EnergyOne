-- Digitale Unterschrift: Tablet vor Ort + DocuSign per E-Mail

create table if not exists contract_files (
  id text primary key,
  contract_id text not null references contracts(id) on delete cascade,
  kind text not null,
  filename text not null,
  mime text not null,
  path text not null,
  created_at timestamptz not null default now()
);

create index if not exists contract_files_contract_idx on contract_files (contract_id, created_at desc);

create table if not exists sign_envelopes (
  id text primary key,
  contract_id text not null references contracts(id) on delete cascade,
  channel text not null,
  provider text not null default 'docusign',
  status text not null,
  recipient_email text,
  recipient_name text,
  docusign_envelope_id text,
  error text,
  sent_by text,
  sent_at timestamptz,
  completed_at timestamptz,
  signed_file_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sign_envelopes_contract_idx on sign_envelopes (contract_id, created_at desc);
create index if not exists sign_envelopes_ds_idx on sign_envelopes (docusign_envelope_id);

insert into feature_flags (key, enabled, label, description, phase) values
  ('docusign_email', true, 'Unterschrift per E-Mail', 'DocuSign: Vertrag rausschicken, Kunde unterschreibt, PDF kommt automatisch ins Portal.', '1')
on conflict (key) do nothing;
