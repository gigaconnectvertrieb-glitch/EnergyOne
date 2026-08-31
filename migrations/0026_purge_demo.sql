-- Live: alle Demo-/Testeinträge raus. Echte Mitarbeiter und echte Aufträge bleiben.

delete from mailbox_attachments
 where message_id in (select id from mailbox_messages where thread_id like 'mt-%');
delete from mailbox_messages where thread_id like 'mt-%' or mailbox = 'jonas.keller';
delete from mailbox_threads where id like 'mt-%';

delete from sign_envelopes where contract_id like 'ctr-%';
delete from contract_files where contract_id like 'ctr-%';
delete from commissions where contract_id like 'ctr-%' or user_id like 'demo-%';
delete from status_history where contract_id like 'ctr-%';
delete from documents where contract_id like 'ctr-%';
delete from contracts where id like 'ctr-%' or user_id like 'demo-%';
delete from customers where id like 'cus-%';

delete from field_visits where id like 'vis-%' or user_id like 'demo-%';
delete from field_doors where id like 'door-%' or territory_id = 'ter-berlin-prenzl';
delete from territories where id = 'ter-berlin-prenzl' or user_id like 'demo-%';

delete from quality_alerts where id like 'qa-%' or user_id like 'demo-%';
delete from partner_contracts where id like 'pc-%' or user_id like 'demo-%';
delete from leads where id like 'lead-%';
delete from career_applications where id like 'app-%';
delete from notifications where user_id like 'demo-%';
delete from knowledge_progress where user_id like 'demo-%';

update profiles set status = 'inactive', notes = 'Demo entfernt'
 where is_demo = true or user_id like 'demo-%';

update settings set value = 'false' where key = 'demo_seeded';
