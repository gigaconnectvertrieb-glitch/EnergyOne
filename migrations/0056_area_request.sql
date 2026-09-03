create table if not exists territory_requests (
  id text primary key,
  user_id text not null,
  label text not null default '',
  lat double precision,
  lng double precision,
  status text not null default 'offen',
  created_at timestamptz not null default now()
);
