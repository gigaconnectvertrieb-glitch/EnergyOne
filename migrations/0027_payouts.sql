-- Auszahlungen: planen, terminieren, durchführen

create table if not exists payout_runs (
  id text primary key,
  title text not null default '',
  scheduled_for date not null,
  status text not null default 'geplant',
  note text,
  created_by text,
  executed_by text,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists payout_runs_sched_idx on payout_runs (scheduled_for, status);

create table if not exists payout_items (
  id text primary key,
  run_id text not null references payout_runs(id) on delete cascade,
  commission_id text not null references commissions(id),
  user_id text,
  amount numeric(10,2) not null,
  unique (commission_id)
);

create index if not exists payout_items_run_idx on payout_items (run_id);
