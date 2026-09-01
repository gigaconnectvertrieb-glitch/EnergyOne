alter table staff_contracts add column if not exists signed_by_company boolean not null default false;
alter table staff_contracts add column if not exists signed_by_agent boolean not null default false;
alter table staff_contracts add column if not exists signed_pdf_path text;
