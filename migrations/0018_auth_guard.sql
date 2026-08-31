create table if not exists auth_attempts (
  id text primary key,
  kind text not null,
  identifier text not null,
  ip text,
  fail_count integer not null default 0,
  locked_until timestamptz,
  last_fail timestamptz not null default now()
);

create unique index if not exists auth_attempts_kind_id
  on auth_attempts (kind, identifier);

create index if not exists auth_attempts_lock_idx
  on auth_attempts (locked_until)
  where locked_until is not null;
