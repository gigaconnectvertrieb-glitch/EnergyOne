insert into settings (key, value) values ('public_phone_label', 'Telefon')
on conflict (key) do update set value = 'Telefon';
