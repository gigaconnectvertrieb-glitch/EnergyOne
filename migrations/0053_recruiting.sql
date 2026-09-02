create table if not exists recruiting_leads (
  id text primary key,
  first_name text not null default '',
  last_name text not null default '',
  phone text,
  email text,
  job text,
  note text,
  status text not null default 'neu',
  created_by text,
  created_at timestamptz not null default now()
);
