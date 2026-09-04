create table if not exists field_buildings (
  id text primary key,
  door_id text,
  territory_id text,
  street text not null default '',
  house text not null default '',
  zip text not null default '',
  city text not null default '',
  floors int not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists field_units (
  id text primary key,
  building_id text not null,
  floor_no int not null default 0,
  unit_no text not null default '',
  status text not null default 'offen',
  note text not null default '',
  updated_at timestamptz not null default now()
);

create index if not exists field_units_building on field_units (building_id);
