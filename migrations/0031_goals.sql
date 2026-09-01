-- Eigenes Umsatzziel je Mitarbeiter + Web-Push

alter table profiles add column if not exists revenue_goal_eur numeric(12,2) not null default 0;
alter table profiles add column if not exists revenue_goal_period text not null default 'month';
alter table profiles add column if not exists goal_nudge boolean not null default true;

create table if not exists push_subscriptions (
  id text primary key,
  user_id text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_sub_user_idx on push_subscriptions (user_id);

create table if not exists goal_nudges (
  id text primary key,
  user_id text not null,
  period_key text not null,
  kind text not null,
  sent_at timestamptz not null default now(),
  unique (user_id, period_key, kind)
);
create index if not exists goal_nudges_user_idx on goal_nudges (user_id, period_key);
