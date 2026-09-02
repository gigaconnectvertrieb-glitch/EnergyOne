alter table tariffs add column if not exists arbeit_ct numeric(8,3);
alter table tariffs add column if not exists grund_year numeric(10,2);
alter table tariffs add column if not exists bonus_year numeric(10,2) not null default 0;
alter table tariffs add column if not exists kind text not null default 'beide';
alter table tariffs add column if not exists web_bookable boolean not null default false;
alter table tariffs add column if not exists notes text;

insert into tariffs (id, provider, name, external_id, type, active, arbeit_ct, grund_year, bonus_year, kind, web_bookable, notes)
values
  ('e1-strom-privat', 'E1', 'E1 Strom Haushalt', 'E1-STROM-PRIVAT', 'strom', false, null, null, 0, 'privat', false, 'Preis eintragen, dann aktiv und web_bookable.'),
  ('e1-strom-gewerbe', 'E1', 'E1 Strom Gewerbe', 'E1-STROM-GEWERBE', 'strom', false, null, null, 0, 'gewerbe', false, 'Preis eintragen, dann aktiv und web_bookable.'),
  ('e1-gas-privat', 'E1', 'E1 Gas Haushalt', 'E1-GAS-PRIVAT', 'gas', false, null, null, 0, 'privat', false, 'Preis eintragen, dann aktiv und web_bookable.'),
  ('e1-gas-gewerbe', 'E1', 'E1 Gas Gewerbe', 'E1-GAS-GEWERBE', 'gas', false, null, null, 0, 'gewerbe', false, 'Preis eintragen, dann aktiv und web_bookable.')
on conflict (id) do nothing;

insert into tariff_bands (id, tariff_id, stufe, kwh_from, kwh_to, amount_eur, amount_ct_kwh)
select x.id, x.tariff_id, x.stufe, 0, 999999, 160, 0
from (
  values
    ('e1b-sp-13', 'e1-strom-privat', 13),
    ('e1b-sp-1', 'e1-strom-privat', 1),
    ('e1b-sg-13', 'e1-strom-gewerbe', 13),
    ('e1b-sg-1', 'e1-strom-gewerbe', 1),
    ('e1b-gp-13', 'e1-gas-privat', 13),
    ('e1b-gp-1', 'e1-gas-privat', 1),
    ('e1b-gg-13', 'e1-gas-gewerbe', 13),
    ('e1b-gg-1', 'e1-gas-gewerbe', 1)
) as x(id, tariff_id, stufe)
on conflict (id) do nothing;
