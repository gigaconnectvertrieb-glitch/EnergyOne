-- Feldarbeit: Gebiete aufspielen, Türen, nicht angetroffen, Wochenliste

create table if not exists territories (
  id text primary key,
  name text not null,
  region_id text references regions(id),
  user_id text,
  filename text not null default '',
  geojson text not null default '{}',
  center_lat numeric(9,6) not null default 51.163,
  center_lng numeric(9,6) not null default 10.448,
  active boolean not null default true,
  uploaded_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists territories_user_idx on territories (user_id) where active = true;

create table if not exists field_doors (
  id text primary key,
  territory_id text not null references territories(id) on delete cascade,
  street text not null default '',
  house text not null default '',
  zip text not null default '',
  city text not null default '',
  lat numeric(9,6) not null,
  lng numeric(9,6) not null,
  note text,
  status text not null default 'offen'
);

create index if not exists field_doors_territory_idx on field_doors (territory_id);

create table if not exists field_visits (
  id text primary key,
  door_id text references field_doors(id) on delete set null,
  territory_id text,
  user_id text not null,
  reason text not null,
  note text,
  street text not null default '',
  house text not null default '',
  zip text not null default '',
  city text not null default '',
  lat numeric(9,6),
  lng numeric(9,6),
  follow_up_on date,
  week_key text,
  list_status text not null default 'offen',
  created_at timestamptz not null default now()
);

create index if not exists field_visits_user_idx on field_visits (user_id, follow_up_on);
create index if not exists field_visits_week_idx on field_visits (week_key, list_status);

insert into feature_flags (key, enabled, label, description, phase) values
  ('field_routing', true, 'Gebiet & Route', 'Satellitenkarte, Gebiet-Download, nicht angetroffen, Wochenliste. PWA für iPhone und Android.', '1')
on conflict (key) do nothing;

insert into territories (id, name, region_id, user_id, filename, geojson, center_lat, center_lng, uploaded_by)
values (
  'ter-berlin-prenzl',
  'Berlin Prenzlauer Berg',
  'reg-ost',
  'demo-vt-keller',
  'berlin-prenzlauer-berg.geojson',
  '{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"name":"Prenzlauer Berg"},"geometry":{"type":"Polygon","coordinates":[[[13.401,52.532],[13.428,52.532],[13.428,52.548],[13.401,52.548],[13.401,52.532]]]}}]}',
  52.540,
  13.415,
  'demo-geo-sued'
)
on conflict (id) do nothing;

insert into field_doors (id, territory_id, street, house, zip, city, lat, lng, note, status) values
  ('door-1', 'ter-berlin-prenzl', 'Kastanienallee', '12', '10435', 'Berlin', 52.53890, 13.40940, 'EG links', 'offen'),
  ('door-2', 'ter-berlin-prenzl', 'Kastanienallee', '28', '10435', 'Berlin', 52.53940, 13.41010, '', 'offen'),
  ('door-3', 'ter-berlin-prenzl', 'Oderberger Straße', '15', '10435', 'Berlin', 52.54080, 13.40990, '3. OG', 'offen'),
  ('door-4', 'ter-berlin-prenzl', 'Schönhauser Allee', '70', '10437', 'Berlin', 52.54190, 13.41220, '', 'offen'),
  ('door-5', 'ter-berlin-prenzl', 'Danziger Straße', '9', '10435', 'Berlin', 52.53910, 13.41840, 'Hinterhaus', 'offen'),
  ('door-6', 'ter-berlin-prenzl', 'Kollwitzstraße', '52', '10405', 'Berlin', 52.53680, 13.41890, '', 'offen'),
  ('door-7', 'ter-berlin-prenzl', 'Prenzlauer Allee', '33', '10405', 'Berlin', 52.53490, 13.41980, '', 'offen'),
  ('door-8', 'ter-berlin-prenzl', 'Helmholtzstraße', '2', '10407', 'Berlin', 52.54320, 13.42110, 'Nicht klingeln vor 16 Uhr', 'offen')
on conflict (id) do nothing;

insert into field_visits (id, door_id, territory_id, user_id, reason, note, street, house, zip, city, lat, lng, follow_up_on, week_key, list_status, created_at) values
  ('vis-1', 'door-2', 'ter-berlin-prenzl', 'demo-vt-keller', 'nicht_angetroffen', 'Niemand da, Briefkasten voll', 'Kastanienallee', '28', '10435', 'Berlin', 52.53940, 13.41010, current_date + 2, to_char(current_date, 'IYYY-"W"IW'), 'offen', now() - interval '2 days'),
  ('vis-2', 'door-4', 'ter-berlin-prenzl', 'demo-vt-keller', 'laufzeit_passt_nicht', 'Vertrag läuft noch bis November', 'Schönhauser Allee', '70', '10437', 'Berlin', 52.54190, 13.41220, current_date + 20, to_char(current_date, 'IYYY-"W"IW'), 'offen', now() - interval '1 day'),
  ('vis-3', 'door-6', 'ter-berlin-prenzl', 'demo-vt-keller', 'nicht_angetroffen', 'Nur Kind zu Hause', 'Kollwitzstraße', '52', '10405', 'Berlin', 52.53680, 13.41890, current_date + 1, to_char(current_date, 'IYYY-"W"IW'), 'offen', now() - interval '3 days')
on conflict (id) do nothing;

insert into knowledge_articles (id, slug, title, category, body, required) values
  ('ka-12', 'feld-gebiet', 'Gebiet und Route', 'Prozess',
   E'Leitung spielt das Gebiet im Portal auf. Jeder Mitarbeiter sieht es auf dem Dashboard und lädt die Datei herunter. Die Karte im Portal (Satellitenbild) führt die Route.

Nicht angetroffen: sofort eintragen. Einmal die Woche entsteht die Nachlaufliste — sortiert nach Grund (nicht da, Laufzeit, später). Die wird abgegangen, bis sie leer ist.

Die Feld-Ansicht ist die App: auf iPhone und Android auf den Home-Bildschirm legen.', true)
on conflict (id) do update set title = excluded.title, body = excluded.body;
