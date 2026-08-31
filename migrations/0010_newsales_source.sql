-- Verträge entstehen in New Sales. Das Portal ist die Provisions-Nachpflege.
alter table contracts add column if not exists newsales_ref text;
alter table contracts add column if not exists source text not null default 'newsales_manual';

insert into settings (key, value) values ('capture_mode', 'newsales_ledger')
on conflict (key) do update set value = excluded.value;

insert into knowledge_articles (id, slug, title, category, body, required) values
  ('ka-10', 'erfassung-name-tarif', 'Nachpflege nach New Sales', 'Prozess',
   E'Der Vertrag wird am Anfang in New Sales erfasst. Im E1-Portal trägt jeder danach nur nach: Kundenname, Tarif, Jahresverbrauch, optional New-Sales-Vorgangsnummer. IBAN und Bankdaten gehören nicht ins Portal. Provision kommt aus Stufe 1/2/3.

Keine New-Sales-API. Kein Versand-Paket aus dem Portal, solange New Sales das Eingabesystem ist.', true)
on conflict (id) do update set title = excluded.title, body = excluded.body;
