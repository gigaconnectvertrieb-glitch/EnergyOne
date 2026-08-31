import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { can } from "@/lib/e1";
import { fillHvVertrag, type HvInput } from "@/lib/hv-vertrag";
import { buildPagedPdf } from "@/lib/sign";
import { nid } from "@/lib/utils";
import { requireProfile, sql } from "./helpers";

function downloadName(last: string, id: string) {
  const slug = (last || "HV").replace(/[^a-zA-Z0-9äöüÄÖÜß_-]+/g, "");
  return `E1-Handelsvertretervertrag-${slug}-${id.slice(0, 8)}.pdf`;
}

export const createHvContract = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: HvInput & { userId?: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "users.manage") && !can(me.role, "settings.manage")) {
      throw new Error("Nur Geschäftsführung erstellt Handelsvertreterverträge.");
    }
    if (!data.first?.trim() || !data.last?.trim()) throw new Error("Name fehlt.");
    if (!data.street?.trim() || !data.zip?.trim() || !data.city?.trim()) {
      throw new Error("Adresse fehlt.");
    }
    const input: HvInput = {
      ...data,
      first: data.first.trim(),
      last: data.last.trim(),
      stufe: 1,
    };
    const lines = fillHvVertrag(input);
    const id = nid();
    let ownerId = data.userId?.trim() || null;
    const staffKey = data.staffId?.trim().toLowerCase() || null;
    if (!ownerId && staffKey) {
      const [hit] = await db<{ user_id: string }>`
        select user_id from profiles where lower(staff_id) = ${staffKey}
      `;
      if (hit) ownerId = hit.user_id;
    }
    await db`
      insert into staff_contracts (
        id, user_id, staff_id, first_name, last_name, street, house_number, zip, city,
        email, phone, birth_date, tax_id, trade_no, region, start_date, stufe, body, created_by
      ) values (
        ${id}, ${ownerId}, ${data.staffId?.trim() || null},
        ${input.first}, ${input.last}, ${data.street.trim()}, ${data.house?.trim() || null},
        ${data.zip.trim()}, ${data.city.trim()}, ${data.email?.trim() || null},
        ${data.phone?.trim() || null}, ${data.birth?.trim() || null}, ${data.taxId?.trim() || null},
        ${data.tradeNo?.trim() || null}, ${data.region?.trim() || null}, ${data.start?.trim() || null},
        1, ${lines.join("\n")}, ${context.userId}
      )
    `;
    if (ownerId) {
      await db`
        update profiles
        set commission_stufe = 1, hv_contract_id = ${id}
        where user_id = ${ownerId}
      `;
    }
    const pdf = buildPagedPdf(lines);
    return {
      id,
      filename: downloadName(input.last, id),
      pdfBase64: pdf.toString("base64"),
      lines,
    };
  });

export const listHvContracts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "users.manage") && !can(me.role, "settings.manage")) {
      throw new Error("Kein Zugriff");
    }
    const rows = await db<{
      id: string;
      staff_id: string | null;
      first_name: string;
      last_name: string;
      city: string | null;
      stufe: number;
      created_at: string;
    }>`
      select id, staff_id, first_name, last_name, city, stufe, created_at
      from staff_contracts
      order by created_at desc
      limit 80
    `;
    return rows;
  });

export const downloadHvContract = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "users.manage") && !can(me.role, "settings.manage")) {
      throw new Error("Kein Zugriff");
    }
    const [row] = await db<{ id: string; last_name: string; body: string }>`
      select id, last_name, body from staff_contracts where id = ${data.id}
    `;
    if (!row) throw new Error("Vertrag nicht gefunden.");
    const pdf = buildPagedPdf(row.body.split("\n"));
    return { filename: downloadName(row.last_name, row.id), pdfBase64: pdf.toString("base64") };
  });
