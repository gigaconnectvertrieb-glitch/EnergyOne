alter table contracts add column if not exists intake jsonb not null default '{}';
alter table contracts add column if not exists bank_bic text;
alter table contracts add column if not exists signed_at date;
alter table contracts add column if not exists delivery_kind text;
