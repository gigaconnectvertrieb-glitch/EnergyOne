create table if not exists profile_flags (
  user_id text not null,
  key text not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

update feature_flags set enabled = true
 where key in (
   'phase2_own_tariffs',
   'phase2_self_service',
   'digital_signature',
   'partner_module',
   'structure_commissions',
   'recruiting_pipeline',
   'quality_alerts',
   'knowledge_area',
   'notifications'
 );

update products set active = true where id in ('prod-e1-strom', 'prod-e1-gas');

insert into tariffs (id, provider, name, external_id, type, active) values
  ('prod-e1-strom', 'E1', 'E1 Strom Fair', 'E1-STROM-FAIR', 'strom', true),
  ('prod-e1-gas', 'E1', 'E1 Gas Fair', 'E1-GAS-FAIR', 'gas', true)
on conflict (id) do update set active = true, name = excluded.name;

insert into tariff_bands (id, tariff_id, stufe, kwh_from, kwh_to, amount_eur, amount_ct_kwh) values
  ('e1s-1a','prod-e1-strom',1,0,2500,90,0),
  ('e1s-1b','prod-e1-strom',1,2501,4500,130,0),
  ('e1s-1c','prod-e1-strom',1,4501,999999,170,0),
  ('e1s-2a','prod-e1-strom',2,0,2500,110,0),
  ('e1s-2b','prod-e1-strom',2,2501,4500,155,0),
  ('e1s-2c','prod-e1-strom',2,4501,999999,195,0),
  ('e1s-3a','prod-e1-strom',3,0,2500,130,0),
  ('e1s-3b','prod-e1-strom',3,2501,4500,180,0),
  ('e1s-3c','prod-e1-strom',3,4501,999999,220,0),
  ('e1g-1a','prod-e1-gas',1,0,8000,70,0),
  ('e1g-1b','prod-e1-gas',1,8001,18000,95,0),
  ('e1g-1c','prod-e1-gas',1,18001,999999,125,0),
  ('e1g-2a','prod-e1-gas',2,0,8000,85,0),
  ('e1g-2b','prod-e1-gas',2,8001,18000,115,0),
  ('e1g-2c','prod-e1-gas',2,18001,999999,145,0),
  ('e1g-3a','prod-e1-gas',3,0,8000,100,0),
  ('e1g-3b','prod-e1-gas',3,8001,18000,135,0),
  ('e1g-3c','prod-e1-gas',3,18001,999999,170,0)
on conflict (id) do nothing;
