update profiles
set commission_stufe = 13
where role = 'super_admin' and coalesce(commission_stufe, 1) < 13;
