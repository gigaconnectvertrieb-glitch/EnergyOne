alter table profiles add column if not exists updated_at timestamptz not null default now();
alter table profiles add column if not exists staff_master_hash text;
