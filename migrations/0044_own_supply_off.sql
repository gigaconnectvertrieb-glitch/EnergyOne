-- Eigener Strom / White-Label bleibt im Code, live aus.
update feature_flags set enabled = false
where key in (
  'phase2_own_tariffs',
  'customer_energy_contracts',
  'phase2_self_service',
  'phase2_market_comm',
  'white_label'
);
