-- Stammdaten, Demo-Organisation und Beispielaufträge

insert into regions (id, name, bundesland, plz_ranges) values
  ('reg-nord', 'Nord', 'HH, SH, NI, HB', '20000-29999, 24000-27999, 26000-31999'),
  ('reg-ost', 'Ost', 'BE, BB, MV, SN, ST, TH', '10000-19999, 01000-09999, 39000-39999'),
  ('reg-west', 'West', 'NW, RP, SL, HE', '40000-65999, 54000-57699'),
  ('reg-sued', 'Süd', 'BY, BW', '80000-97999, 70000-79999')
on conflict (id) do nothing;

insert into products (id, name, type, provider, base_price, work_price, guarantee_months, bonus, active, commission_abschluss, commission_folge, commission_bestand, storno_monate, internal_notes) values
  ('prod-ns-oeko12', 'New Sales Ökostrom 12', 'strom', 'NewSales', 12.90, 28.40, 12, 50, true, 120, 40, 15, 12, 'Kooperation New Sales – Standard Öko'),
  ('prod-ns-strom24', 'New Sales Strom 24 Garantie', 'strom', 'NewSales', 11.50, 27.10, 24, 80, true, 145, 45, 18, 12, '24 Monate Preisgarantie'),
  ('prod-ns-wp', 'New Sales Wärmepumpenstrom', 'strom', 'NewSales', 14.90, 24.80, 12, 0, true, 160, 50, 20, 12, 'Für WP-Haushalte'),
  ('prod-ns-gas12', 'New Sales Gas Wärme 12', 'gas', 'NewSales', 9.90, 9.80, 12, 40, true, 90, 30, 12, 12, 'Gas 12 Monate'),
  ('prod-ns-gas24', 'New Sales Gas Wärme 24', 'gas', 'NewSales', 8.90, 9.40, 24, 70, true, 110, 35, 14, 12, 'Gas 24 Monate'),
  ('prod-e1-strom', 'E1 Strom Fair', 'strom', 'E1', 10.90, 26.90, 12, 75, false, 130, 48, 20, 12, 'Phase 2 – eigene Marke, Feature-Flag'),
  ('prod-e1-gas', 'E1 Gas Fair', 'gas', 'E1', 8.50, 9.20, 12, 40, false, 95, 32, 12, 12, 'Phase 2 – eigene Marke, Feature-Flag')
on conflict (id) do nothing;

insert into feature_flags (key, enabled, label, description, phase) values
  ('phase2_own_tariffs', false, 'Eigene E1-Tarife', 'Eigene Strom- und Gas-Tarife der Marke E1 aktivieren.', '2'),
  ('phase2_self_service', false, 'Kunden-Self-Service', 'Kundenportal für Vertrag, Zählerstand und Rechnungen.', '2'),
  ('phase2_market_comm', false, 'Marktkommunikation', 'Vorbereitung MaBiS / GPKE und Abrechnung.', '2'),
  ('partner_module', true, 'Partner & Handelsvertreter', 'Freie Handelsvertreter nach § 84 HGB.', '1'),
  ('structure_commissions', true, 'Strukturprovisionen', 'Mehrstufige Provisionen für Teamaufbau.', '1'),
  ('white_label', false, 'White-Label', 'Eigenes Logo für Partner im Portal.', '2'),
  ('recruiting_pipeline', true, 'Recruiting & Onboarding', 'Bewerberpipeline und digitale Freischaltung.', '1'),
  ('quality_alerts', true, 'Qualitätssteuerung', 'Stornoquote, Warnungen und Sperren.', '1'),
  ('knowledge_area', true, 'Wissen & Schulung', 'Wissensbereich und Schulungsnachweise.', '1'),
  ('digital_signature', true, 'Digitale Unterschrift', 'Unterschrift per Finger oder Stift.', '1'),
  ('notifications', true, 'Benachrichtigungen', 'In-App-Hinweise zu Status und Provision.', '1')
on conflict (key) do nothing;

insert into settings (key, value) values
  ('company_name', 'E1 Direktvertrieb'),
  ('slogan', 'Energie, die zu Ihnen passt.'),
  ('storno_window_months', '12'),
  ('demo_seeded', 'true')
on conflict (key) do nothing;

insert into profiles (user_id, first_name, last_name, role, user_type, region_id, supervisor_id, status, phone, monthly_target, onboarding_status, is_demo, notes) values
  ('demo-geo-sued', 'Miriam', 'Vogt', 'gebietsleiter', 'angestellt', 'reg-sued', null, 'active', '089 1200 1001', 40, 'aktiv', true, 'Demo Gebietsleitung Süd'),
  ('demo-tl-bayern', 'Lena', 'Hofmann', 'teamleiter', 'angestellt', 'reg-sued', 'demo-geo-sued', 'active', '089 1200 1010', 20, 'aktiv', true, 'Demo Teamleitung Bayern'),
  ('demo-vt-keller', 'Jonas', 'Keller', 'vertrieb', 'angestellt', 'reg-sued', 'demo-tl-bayern', 'active', '0176 10002001', 8, 'aktiv', true, 'Demo Vertrieb'),
  ('demo-vt-berg', 'Sara', 'Berg', 'vertrieb', 'freier_handelsvertreter', 'reg-sued', 'demo-tl-bayern', 'active', '0176 10002002', 10, 'aktiv', true, 'Demo HV § 84 HGB'),
  ('demo-tl-west', 'Tim', 'Krause', 'teamleiter', 'angestellt', 'reg-west', null, 'active', '0211 400 200', 18, 'aktiv', true, 'Demo Team West'),
  ('demo-vt-schwarz', 'Nina', 'Schwarz', 'vertrieb', 'angestellt', 'reg-west', 'demo-tl-west', 'active', '0171 5556677', 8, 'aktiv', true, 'Demo Vertrieb West'),
  ('demo-backoffice', 'Paula', 'Richter', 'backoffice', 'angestellt', 'reg-west', null, 'active', '030 4000 10', 0, 'aktiv', true, 'Demo Backoffice'),
  ('demo-buchhaltung', 'Omar', 'Yilmaz', 'buchhaltung', 'angestellt', null, null, 'active', '030 4000 20', 0, 'aktiv', true, 'Demo Buchhaltung')
on conflict (user_id) do nothing;

insert into customers (id, salutation, first_name, last_name, birth_date, email, phone, street, house_number, zip, city, consents, notes) values
  ('cus-1', 'Herr', 'Hans', 'Müller', '1978-04-12', 'hans.mueller@example.de', '030 998877', 'Kastanienallee', '12', '10435', 'Berlin', '{"dsgvo":true,"sepa":true}', 'Stammkunde'),
  ('cus-2', 'Frau', 'Anna', 'Schmidt', '1990-11-03', 'anna.schmidt@example.de', '089 332211', 'Leopoldstraße', '44', '80802', 'München', '{"dsgvo":true,"sepa":true}', null),
  ('cus-3', 'Herr', 'Thomas', 'Weber', '1969-02-21', 'thomas.weber@example.de', '040 776655', 'Schulterblatt', '8', '20357', 'Hamburg', '{"dsgvo":true,"sepa":true}', 'Strom + Gas'),
  ('cus-4', 'Frau', 'Claudia', 'König', '1985-07-19', 'claudia.koenig@example.de', '0221 445566', 'Venloer Straße', '201', '50823', 'Köln', '{"dsgvo":true,"sepa":true}', 'Storno + Gas'),
  ('cus-5', 'Herr', 'Jonas', 'Hartmann', '1995-01-08', 'jonas.hartmann@example.de', '0711 223344', 'Königstraße', '18', '70173', 'Stuttgart', '{"dsgvo":true,"sepa":true}', null),
  ('cus-6', 'Frau', 'Mira', 'Novak', '1982-09-30', 'mira.novak@example.de', '069 111222', 'Berger Straße', '90', '60316', 'Frankfurt am Main', '{"dsgvo":true,"sepa":true}', null),
  ('cus-7', 'Herr', 'Bernd', 'Schulze', '1960-12-02', 'bernd.schulze@example.de', '0341 778899', 'Karl-Liebknecht-Straße', '5', '04107', 'Leipzig', '{"dsgvo":true,"sepa":true}', null),
  ('cus-8', 'Frau', 'Elena', 'Krüger', '1988-06-14', 'elena.krueger@example.de', '0511 334455', 'Lister Meile', '27', '30161', 'Hannover', '{"dsgvo":true,"sepa":true}', 'Korrektur: Zählernummer'),
  ('cus-9', 'Divers', 'Alex', 'Bergmann', '1992-03-27', 'alex.bergmann@example.de', '0201 667788', 'Rüttenscheider Straße', '120', '45130', 'Essen', '{"dsgvo":true,"sepa":true}', 'Nur Gas'),
  ('cus-10', 'Frau', 'Sofia', 'Albrecht', '1975-10-05', 'sofia.albrecht@example.de', '089 778899', 'Tegernseer Landstraße', '66', '81541', 'München', '{"dsgvo":true,"sepa":true}', null)
on conflict (id) do nothing;

insert into contracts (id, customer_id, user_id, type, product_id, status, consumption_kwh, meter_number, previous_provider, start_date, bank_iban, bank_owner, commission_rate, commission_amount, sepa_confirmed, privacy_confirmed, signature_confirmed, notes, created_at) values
  ('ctr-1', 'cus-1', 'demo-vt-keller', 'strom', 'prod-ns-oeko12', 'bestaetigt', 3200, '1DE000123456', 'Vattenfall', '2026-09-01', 'DE89370400440532013000', 'Hans Müller', 120, 120, true, true, true, null, '2026-08-12 10:00:00+00'),
  ('ctr-2', 'cus-2', 'demo-vt-berg', 'strom', 'prod-ns-strom24', 'in_pruefung', 4100, '1DE000223344', 'E.ON', '2026-10-01', 'DE12500105170648489890', 'Anna Schmidt', 145, 145, true, true, true, null, '2026-08-28 14:20:00+00'),
  ('ctr-3', 'cus-3', 'demo-vt-keller', 'strom', 'prod-ns-wp', 'beliefert', 7800, '1DE000998877', 'Stadtwerke Hamburg', '2026-07-01', 'DE02100500000024290661', 'Thomas Weber', 160, 160, true, true, true, null, '2026-06-18 09:00:00+00'),
  ('ctr-4', 'cus-3', 'demo-vt-keller', 'gas', 'prod-ns-gas24', 'bestaetigt', 18000, 'GAS-77881', 'VNG', '2026-07-01', 'DE02100500000024290661', 'Thomas Weber', 110, 110, true, true, true, null, '2026-06-18 09:10:00+00'),
  ('ctr-5', 'cus-4', 'demo-vt-schwarz', 'strom', 'prod-ns-oeko12', 'storniert', 2900, '1DE000555111', 'RheinEnergie', '2026-08-01', 'DE13700800000074290661', 'Claudia König', 120, 120, true, true, true, 'Widerruf durch Kunden', '2026-07-22 16:00:00+00'),
  ('ctr-6', 'cus-4', 'demo-vt-schwarz', 'gas', 'prod-ns-gas12', 'uebermittelt', 12000, 'GAS-12009', 'RheinEnergie', '2026-09-15', 'DE13700800000074290661', 'Claudia König', 90, 90, true, true, true, null, '2026-08-20 11:30:00+00'),
  ('ctr-7', 'cus-5', 'demo-vt-berg', 'strom', 'prod-ns-oeko12', 'erfasst', 2500, '1DE000441122', 'EnBW', '2026-10-01', 'DE89370400440532013000', 'Jonas Hartmann', 120, 120, true, true, true, null, '2026-08-30 18:40:00+00'),
  ('ctr-8', 'cus-6', 'demo-tl-west', 'strom', 'prod-ns-strom24', 'uebermittelt', 3600, '1DE000667788', 'Mainova', '2026-09-01', 'DE12500105170648489890', 'Mira Novak', 145, 145, true, true, true, null, '2026-08-21 08:15:00+00'),
  ('ctr-9', 'cus-7', 'demo-vt-keller', 'strom', 'prod-ns-oeko12', 'abgerechnet', 3400, '1DE000334455', 'enviaM', '2026-03-01', 'DE02100500000024290661', 'Bernd Schulze', 120, 120, true, true, true, null, '2026-02-11 12:00:00+00'),
  ('ctr-10', 'cus-8', 'demo-vt-schwarz', 'strom', 'prod-ns-strom24', 'korrektur_noetig', 2700, '', 'enercity', '2026-10-01', 'DE89370400440532013000', 'Elena Krüger', 145, 145, true, true, false, 'Zählernummer fehlt', '2026-08-29 13:05:00+00'),
  ('ctr-11', 'cus-9', 'demo-tl-bayern', 'gas', 'prod-ns-gas24', 'bestaetigt', 15000, 'GAS-33001', 'EWE', '2026-09-01', 'DE12500105170648489890', 'Alex Bergmann', 110, 110, true, true, true, null, '2026-08-08 10:45:00+00'),
  ('ctr-12', 'cus-10', 'demo-vt-berg', 'strom', 'prod-ns-oeko12', 'bestaetigt', 2200, '1DE000889900', 'SWM', '2026-09-15', 'DE02100500000024290661', 'Sofia Albrecht', 120, 120, true, true, true, null, '2026-08-25 17:20:00+00')
on conflict (id) do nothing;

insert into status_history (id, contract_id, old_status, new_status, changed_by, comment) values
  ('sh-1', 'ctr-1', 'erfasst', 'in_pruefung', 'demo-vt-keller', 'An Backoffice übergeben'),
  ('sh-2', 'ctr-1', 'in_pruefung', 'uebermittelt', 'demo-backoffice', 'An New Sales'),
  ('sh-3', 'ctr-1', 'uebermittelt', 'bestaetigt', 'demo-backoffice', 'Bestätigung New Sales'),
  ('sh-4', 'ctr-5', 'bestaetigt', 'storniert', 'demo-backoffice', 'Widerruf durch Kunden'),
  ('sh-5', 'ctr-10', 'in_pruefung', 'korrektur_noetig', 'demo-backoffice', 'Zählernummer fehlt')
on conflict (id) do nothing;

insert into commissions (id, contract_id, user_id, amount, type, status, note) values
  ('com-1', 'ctr-1', 'demo-vt-keller', 120, 'abschluss', 'freigegeben', null),
  ('com-2', 'ctr-3', 'demo-vt-keller', 160, 'abschluss', 'ausgezahlt', null),
  ('com-3', 'ctr-4', 'demo-vt-keller', 110, 'abschluss', 'offen', null),
  ('com-4', 'ctr-5', 'demo-vt-schwarz', -120, 'storno', 'storniert', 'Storno innerhalb Frist'),
  ('com-5', 'ctr-9', 'demo-vt-keller', 120, 'abschluss', 'ausgezahlt', null),
  ('com-6', 'ctr-11', 'demo-tl-bayern', 110, 'abschluss', 'offen', null),
  ('com-7', 'ctr-12', 'demo-vt-berg', 120, 'abschluss', 'offen', null),
  ('com-8', 'ctr-12', 'demo-tl-bayern', 25, 'struktur', 'offen', 'Teamleitung Overlay')
on conflict (id) do nothing;

insert into quality_alerts (id, user_id, kind, message, severity) values
  ('qa-1', 'demo-vt-schwarz', 'stornoquote', 'Stornoquote im laufenden Quartal über 20 %. Qualität prüfen.', 'warn')
on conflict (id) do nothing;

insert into partner_contracts (id, user_id, start_date, commission_abschluss, commission_struktur, status, notes) values
  ('pc-1', 'demo-vt-berg', '2026-03-01', 145, 20, 'aktiv', 'Freier Handelsvertreter § 84 HGB, Bayern')
on conflict (id) do nothing;

insert into leads (id, name, phone, zip, message, status) values
  ('lead-1', 'Familie Dorn', '0172 4445566', '80331', 'Bitte Rückruf am Abend, Einfamilienhaus.', 'neu'),
  ('lead-2', 'Katrin Wolff', '0151 7788990', '50667', 'Gasheizung, Vergleich gewünscht.', 'neu')
on conflict (id) do nothing;

insert into career_applications (id, first_name, last_name, email, phone, position, motivation, status) values
  ('app-1', 'Felix', 'Brandt', 'felix.brandt@example.de', '0170 1112233', 'Vertriebsmitarbeiter (m/w/d)', '5 Jahre Energievertrieb, suche ehrliches Modell ohne Druck.', 'eingegangen'),
  ('app-2', 'Amelie', 'Sommer', 'amelie.sommer@example.de', '0160 9988776', 'Freier Handelsvertreter', 'Will ein eigenes Team in Sachsen aufbauen.', 'gespraech')
on conflict (id) do nothing;

insert into knowledge_articles (id, slug, title, category, body, required) values
  ('ka-1', 'beratungsethik', 'Beratung ohne Druck', 'Haltung', E'E1 steht für ehrliche, druckfreie Beratung vor Ort.\n\n- Keine Angstmacherei mit Preissprüngen.\n- Jede Empfehlung muss der Kunde verstehen können.\n- Widerruf und Lieferantenwechsel immer erklären.\n- Abschluss nur, wenn der Kunde wirklich zustimmt.\n\nEin guter Abschluss ist einer, den der Kunde in sechs Monaten immer noch für richtig hält.', true),
  ('ka-2', 'wechselprozess', 'So funktioniert der Anbieterwechsel', 'Fachwissen', E'Der Strom- und Gasmarkt in Deutschland ist liberalisiert.\n\n1. Vertrag aufnehmen (Zählernummer / MaLo, Verbrauch, IBAN).\n2. Übermittlung an den Lieferanten (Phase 1: New Sales).\n3. Kündigung beim Altversorger übernimmt der neue Lieferant.\n4. Keine Versorgungslücke – die Grundversorgung greift notfalls.\n5. Lieferbeginn laut Wunschtermin oder nächstmöglichem Termin.\n\nGrundversorgung ist oft teurer. Das darf erwähnt werden, aber nie als Drohung.', true),
  ('ka-3', 'preise', 'Was den Energiepreis beeinflusst', 'Fachwissen', E'Der Arbeitspreis besteht aus:\n- Beschaffung / Energie\n- Netzentgelten\n- Steuern, Umlagen, Konzessionsabgabe\n\nDer Grundpreis deckt Messstellenbetrieb und feste Kosten.\nPreisgarantien beziehen sich meist nur auf den Beschaffungsanteil. Immer im Produkt hinterlegen, was genau gilt.', false),
  ('ka-4', 'auftrag', 'Auftragserfassung im Portal', 'Produkt', E'Schritte:\n1. Kundendaten vollständig.\n2. Dublettenprüfung (Name, Adresse, Geburtsdatum).\n3. Maximal EIN aktiver Stromvertrag – das System blockt den zweiten.\n4. Gas darf parallel laufen.\n5. Foto der letzten Rechnung hilft beim Verbrauch.\n6. IBAN-Prüfsumme muss stimmen.\n7. SEPA, Datenschutz und Unterschrift sind Pflicht.\n8. Nach Absenden: Status erfasst → Backoffice.', true),
  ('ka-5', 'provision', 'Provisionen verstehen', 'Vergütung', E'Phase 1: Provisionssatz liegt am Produkt.\nBerechnung bei Status bestätigt oder beliefert.\nStorno innerhalb der Frist (Standard 12 Monate) erzeugt eine Gegenbuchung.\nFreigabe durch Teamleitung oder Buchhaltung, Auszahlung als CSV/Excel.\nStrukturprovisionen fallen an, wenn ein Teamleiter Abschlüsse im Team hat.', false),
  ('ka-6', 'dsgvo', 'DSGVO im Außendienst', 'Compliance', E'Nur Daten erheben, die für den Vertrag nötig sind.\nEinwilligungen dokumentieren.\nFotos von Ausweis und Rechnung gehören in die Kundenakte, nicht aufs private Handy.\nAuskunfts- und Löschanfragen gehen an Super-Admin / Backoffice.\nKeine Kundendaten in Messenger-Chats.', true)
on conflict (id) do nothing;
