alter table field_emergencies add column if not exists kind text not null default 'video';
alter table field_emergencies add column if not exists lat numeric(9,6);
alter table field_emergencies add column if not exists lng numeric(9,6);
alter table field_emergencies add column if not exists note text;
alter table field_emergencies add column if not exists address text;
