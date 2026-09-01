alter table profiles add column if not exists payout_iban text;
alter table profiles add column if not exists payout_name text;

insert into settings (key, value) values
  ('payout_debtor_name', 'E1 Direktvertrieb Inh. Orhan Salo und Luca Marrancone'),
  ('payout_debtor_iban', ''),
  ('payout_debtor_bic', '')
on conflict (key) do nothing;
