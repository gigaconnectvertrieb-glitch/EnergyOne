create table if not exists territory_members (
  territory_id text not null references territories(id) on delete cascade,
  user_id text not null,
  created_at timestamptz not null default now(),
  primary key (territory_id, user_id)
);

create index if not exists territory_members_user_idx on territory_members (user_id);

insert into territory_members (territory_id, user_id)
select id, user_id from territories
where user_id is not null and user_id <> ''
on conflict do nothing;
