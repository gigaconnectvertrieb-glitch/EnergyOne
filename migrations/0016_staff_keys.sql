alter table profiles add column if not exists invite_code text;
alter table profiles add column if not exists totp_enrolled_at timestamptz;

create unique index if not exists profiles_invite_code_uidx
  on profiles (invite_code)
  where invite_code is not null;

insert into settings (key, value) values
  ('admin_master_key', '482917365018')
on conflict (key) do nothing;
