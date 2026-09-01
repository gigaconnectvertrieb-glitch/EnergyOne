alter table leads add column if not exists kind text not null default 'privat';
alter table leads add column if not exists company text;
