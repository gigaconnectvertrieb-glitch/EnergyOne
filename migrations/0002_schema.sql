-- E1 Direktvertrieb – Kernschema (Phase 1 + vorbereitete Skalierung / Phase 2)

create table if not exists regions (
  id text primary key,
  name text not null,
  bundesland text not null default '',
  plz_ranges text not null default '',
  parent_id text,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  user_id text primary key,
  first_name text not null default '',
  last_name text not null default '',
  role text not null default 'vertrieb',
  user_type text not null default 'angestellt',
  region_id text references regions(id),
  supervisor_id text,
  status text not null default 'pending',
  phone text,
  monthly_target integer not null default 8,
  totp_secret text,
  totp_enabled boolean not null default false,
  onboarding_status text not null default 'neu',
  white_label_logo text,
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  last_login timestamptz
);

create table if not exists products (
  id text primary key,
  name text not null,
  type text not null,
  provider text not null,
  base_price numeric(10,4) not null default 0,
  work_price numeric(10,4) not null default 0,
  guarantee_months integer not null default 12,
  bonus numeric(10,2) not null default 0,
  validity_from date,
  validity_to date,
  active boolean not null default true,
  internal_notes text,
  commission_abschluss numeric(10,2) not null default 0,
  commission_folge numeric(10,2) not null default 0,
  commission_bestand numeric(10,2) not null default 0,
  storno_monate integer not null default 12,
  created_at timestamptz not null default now()
);

create table if not exists customers (
  id text primary key,
  salutation text,
  first_name text not null,
  last_name text not null,
  birth_date date,
  email text,
  phone text,
  street text,
  house_number text,
  zip text,
  city text,
  consents jsonb not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists contracts (
  id text primary key,
  customer_id text not null references customers(id),
  user_id text not null,
  type text not null,
  product_id text references products(id),
  status text not null default 'erfasst',
  consumption_kwh integer,
  meter_number text,
  previous_provider text,
  start_date date,
  end_date date,
  bank_iban text,
  bank_owner text,
  commission_rate numeric(10,2),
  commission_amount numeric(10,2),
  sepa_confirmed boolean not null default false,
  privacy_confirmed boolean not null default false,
  signature_confirmed boolean not null default false,
  cancel_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uniq_active_strom_per_customer
  on contracts (customer_id)
  where type = 'strom' and status <> 'storniert';

create index if not exists contracts_user_idx on contracts (user_id);
create index if not exists contracts_status_idx on contracts (status);
create index if not exists contracts_customer_idx on contracts (customer_id);
create index if not exists contracts_created_idx on contracts (created_at desc);

create table if not exists commissions (
  id text primary key,
  contract_id text not null references contracts(id),
  user_id text not null,
  amount numeric(10,2) not null,
  type text not null,
  status text not null default 'offen',
  calculated_at timestamptz not null default now(),
  paid_at timestamptz,
  note text
);

create index if not exists commissions_user_idx on commissions (user_id);
create index if not exists commissions_status_idx on commissions (status);

create table if not exists documents (
  id text primary key,
  contract_id text not null references contracts(id) on delete cascade,
  type text not null,
  file_path text not null,
  uploaded_by text,
  uploaded_at timestamptz not null default now()
);

create table if not exists status_history (
  id text primary key,
  contract_id text not null references contracts(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by text,
  changed_at timestamptz not null default now(),
  comment text
);

create table if not exists audit_log (
  id text primary key,
  user_id text,
  action text not null,
  entity_type text,
  entity_id text,
  old_values jsonb,
  new_values jsonb,
  ip text,
  created_at timestamptz not null default now()
);

create index if not exists audit_created_idx on audit_log (created_at desc);

create table if not exists notifications (
  id text primary key,
  user_id text not null,
  type text not null,
  title text not null,
  message text not null,
  read boolean not null default false,
  link text,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on notifications (user_id, read);

create table if not exists feature_flags (
  key text primary key,
  enabled boolean not null default false,
  label text not null,
  description text not null default '',
  phase text not null default '1'
);

create table if not exists settings (
  key text primary key,
  value text not null default ''
);

create table if not exists knowledge_articles (
  id text primary key,
  slug text not null unique,
  title text not null,
  category text not null,
  body text not null,
  required boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists knowledge_progress (
  user_id text not null,
  article_id text not null references knowledge_articles(id),
  completed_at timestamptz not null default now(),
  primary key (user_id, article_id)
);

create table if not exists leads (
  id text primary key,
  name text not null,
  phone text not null,
  zip text,
  message text,
  status text not null default 'neu',
  assigned_to text,
  created_at timestamptz not null default now()
);

create table if not exists career_applications (
  id text primary key,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  position text not null default 'Vertriebsmitarbeiter (m/w/d)',
  motivation text,
  status text not null default 'eingegangen',
  created_at timestamptz not null default now()
);

create table if not exists partner_contracts (
  id text primary key,
  user_id text not null,
  start_date date,
  end_date date,
  commission_abschluss numeric(10,2),
  commission_struktur numeric(10,2),
  notes text,
  status text not null default 'aktiv',
  created_at timestamptz not null default now()
);

create table if not exists quality_alerts (
  id text primary key,
  user_id text not null,
  kind text not null,
  message text not null,
  severity text not null default 'warn',
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
