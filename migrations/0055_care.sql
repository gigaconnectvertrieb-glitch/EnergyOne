create table if not exists customer_care (
  id text primary key,
  customer_id text,
  contract_id text,
  due_on date not null,
  status text not null default 'offen',
  last_mail_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists customer_care_contract on customer_care (contract_id);
