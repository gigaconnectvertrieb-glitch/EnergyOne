insert into settings (key, value) values
  ('storno_window_days', '14')
on conflict (key) do update set value = '14';

update settings set value = '14' where key = 'storno_window_months';
