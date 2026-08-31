alter table profiles add column if not exists staff_id text;

create unique index if not exists profiles_staff_id_uidx
  on profiles (staff_id)
  where staff_id is not null;
