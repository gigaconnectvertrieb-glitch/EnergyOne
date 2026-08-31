-- Gebietsplanung: Stadt suchen, Straßen einspielen, Tagespläne

create table if not exists work_plans (
  id text primary key,
  territory_id text references territories(id) on delete cascade,
  city text not null,
  state text not null default '',
  per_day integer not null default 30,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists work_days (
  id text primary key,
  plan_id text not null references work_plans(id) on delete cascade,
  day_index integer not null,
  user_id text,
  meters integer not null default 0,
  stop_count integer not null default 0,
  status text not null default 'offen',
  work_date date
);

create index if not exists work_days_user_idx on work_days (user_id, status);

create table if not exists work_stops (
  id text primary key,
  day_id text not null references work_days(id) on delete cascade,
  door_id text,
  seq integer not null,
  street text not null default '',
  lat numeric(9,6) not null,
  lng numeric(9,6) not null
);

create index if not exists work_stops_day_idx on work_stops (day_id, seq);
