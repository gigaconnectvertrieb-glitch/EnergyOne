insert into settings (key, value) values
  ('public_phone', ''),
  ('public_phone_label', 'Satellite-Festnetz')
on conflict (key) do nothing;
