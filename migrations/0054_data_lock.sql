create table if not exists contract_locks (
  contract_id text primary key,
  salt text not null,
  iv text not null,
  payload text not null
);
