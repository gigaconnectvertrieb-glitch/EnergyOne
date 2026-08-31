update mail_identities
set display_name = 'Luca Marco Marrancone'
where display_name = 'Luca-Marco Marrancone';

update mailbox_messages
set body_text = replace(body_text, 'Luca-Marco', 'Luca Marco'),
    snippet = replace(snippet, 'Luca-Marco', 'Luca Marco')
where body_text like '%Luca-Marco%' or snippet like '%Luca-Marco%';
