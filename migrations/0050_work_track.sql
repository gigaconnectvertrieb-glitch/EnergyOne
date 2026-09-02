create table if not exists work_shifts (
  id text primary key,
  user_id text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  start_lat numeric(9,6),
  start_lng numeric(9,6),
  start_address text,
  last_lat numeric(9,6),
  last_lng numeric(9,6),
  last_at timestamptz
);

create index if not exists work_shifts_user_idx on work_shifts (user_id, started_at desc);

create table if not exists work_pings (
  id text primary key,
  shift_id text not null references work_shifts(id) on delete cascade,
  user_id text not null,
  lat numeric(9,6) not null,
  lng numeric(9,6) not null,
  accuracy numeric(8,1),
  address text,
  created_at timestamptz not null default now()
);

create index if not exists work_pings_shift_idx on work_pings (shift_id, created_at desc);
