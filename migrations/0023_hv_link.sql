alter table profiles add column if not exists hv_contract_id text;
create index if not exists staff_contracts_user_idx on staff_contracts (user_id);
create index if not exists staff_contracts_staff_idx on staff_contracts (staff_id);
