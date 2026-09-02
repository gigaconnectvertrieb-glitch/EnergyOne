update feature_flags
set enabled = true
where key = 'phase2_own_tariffs';

insert into feature_flags (key, enabled, label, description, phase)
values ('phase2_own_tariffs', true, 'Eigene E1-Tarife', 'Eigene Strom- und Gas-Tarife der Marke E1 aktivieren.', '2')
on conflict (key) do update set enabled = true;

update tariffs set
  arbeit_ct = 29.5,
  grund_year = 144,
  active = true,
  web_bookable = true
where id = 'e1-strom-privat';

update tariffs set
  arbeit_ct = 24.9,
  grund_year = 180,
  active = true,
  web_bookable = true
where id = 'e1-strom-gewerbe';

update tariffs set
  arbeit_ct = 11.5,
  grund_year = 144,
  active = true,
  web_bookable = true
where id = 'e1-gas-privat';

update tariffs set
  arbeit_ct = 9.8,
  grund_year = 180,
  active = true,
  web_bookable = true
where id = 'e1-gas-gewerbe';
