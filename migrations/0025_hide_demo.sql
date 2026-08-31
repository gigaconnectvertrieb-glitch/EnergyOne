update profiles set status = 'inactive' where is_demo = true;
update territories set active = false where user_id like 'demo-%' or id = 'ter-berlin-prenzl';
update field_visits set list_status = 'erledigt' where user_id like 'demo-%' or id like 'vis-%';
