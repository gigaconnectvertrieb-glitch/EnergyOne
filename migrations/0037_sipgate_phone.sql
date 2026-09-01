insert into settings (key, value) values
  ('public_phone', '015678954406'),
  ('public_phone_label', 'Satellite · sipgate')
on conflict (key) do update set value = excluded.value;
