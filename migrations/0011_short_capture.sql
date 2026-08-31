insert into settings (key, value) values ('capture_mode', 'newsales_short')
on conflict (key) do update set value = excluded.value;

insert into knowledge_articles (id, slug, title, category, body, required) values
  ('ka-11', 'kurz-erfassen', 'Kurz erfassen', 'Prozess',
   E'Verträge werden in New Sales angelegt. Teamleiter sehen die Abschlüsse dort.

Im E1-Portal tragen Mitarbeiter nur kurz nach, damit die Datenbank voll ist:
- Vorname, Nachname
- Adresse
- Telefon
- Tarif
- Jahresverbrauch (für die Provision)

Kein IBAN, keine Unterschrift, kein Paket an New Sales.', true)
on conflict (id) do update set title = excluded.title, body = excluded.body;
