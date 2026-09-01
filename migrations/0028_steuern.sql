-- Steuer-Dossier und Ausgabenbuch für Handelsvertreter

create table if not exists tax_settings (
  user_id text primary key,
  kleinunternehmer boolean not null default true,
  dauerfrist boolean not null default false,
  steuerberater text,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists tax_expenses (
  id text primary key,
  user_id text not null,
  spent_on date not null,
  category text not null,
  amount numeric(10,2) not null,
  vat_rate numeric(5,2) not null default 0,
  gross boolean not null default true,
  km numeric(8,1),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists tax_expenses_user_idx on tax_expenses (user_id, spent_on desc);
