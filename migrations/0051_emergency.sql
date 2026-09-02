create table if not exists field_emergencies (
  id text primary key,
  user_id text not null,
  room text not null,
  status text not null default 'offen',
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
