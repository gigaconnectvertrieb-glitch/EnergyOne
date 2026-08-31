alter table sign_envelopes alter column contract_id drop not null;
alter table sign_envelopes add column if not exists staff_contract_id text;
create index if not exists sign_envelopes_staff_idx on sign_envelopes (staff_contract_id);

alter table staff_contracts add column if not exists signed_at timestamptz;
alter table staff_contracts add column if not exists signed_channel text;
alter table staff_contracts add column if not exists signer_email text;

create table if not exists staff_contract_files (
  id text primary key,
  staff_contract_id text not null references staff_contracts(id) on delete cascade,
  kind text not null,
  filename text not null,
  mime text not null,
  path text not null,
  created_at timestamptz not null default now()
);
