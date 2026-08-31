import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { asStr } from "@/lib/utils";
import { assertCanSeeUser, audit, requireProfile, sql } from "./helpers";
import { docusignConnection, docusignReady, sendDocusignEnvelope, contractPdfFor } from "./docusign.server";
import { fillVertrag } from "@/lib/vertrag";
import { nid } from "@/lib/utils";
import { putFile } from "./ops.server";

export const getSignStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => docusignConnection());

export const listSignEnvelopes = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { contractId: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const [c] = await db<Record<string, unknown>>`select user_id from contracts where id = ${data.contractId}`;
    if (!c) throw new Error("Auftrag nicht gefunden");
    await assertCanSeeUser(db, me, asStr(c.user_id));
    const rows = await db<Record<string, unknown>>`
      select * from sign_envelopes where contract_id = ${data.contractId} order by created_at desc
    `;
    const files = await db<Record<string, unknown>>`
      select * from contract_files where contract_id = ${data.contractId} order by created_at desc
    `;
    return {
      envelopes: rows.map((r) => ({
        id: asStr(r.id),
        channel: asStr(r.channel),
        status: asStr(r.status),
        recipient_email: asStr(r.recipient_email),
        recipient_name: asStr(r.recipient_name),
        error: asStr(r.error),
        sent_at: asStr(r.sent_at),
        completed_at: asStr(r.completed_at),
      })),
      files: files.map((f) => ({
        id: asStr(f.id),
        kind: asStr(f.kind),
        filename: asStr(f.filename),
        created_at: asStr(f.created_at),
      })),
    };
  });

export const sendSignEmail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { contractId: string; email: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const [row] = await db<Record<string, unknown>>`
      select c.*, cu.first_name, cu.last_name, cu.email, cu.phone, cu.street, cu.house_number,
             cu.zip, cu.city, cu.birth_date,
             coalesce(p.name, t.name) as product_name,
             p.work_price as work_price,
             p.base_price as base_price,
             pr.first_name as advisor_first, pr.last_name as advisor_last
      from contracts c
      join customers cu on cu.id = c.customer_id
      left join products p on p.id = c.product_id
      left join tariffs t on t.id = c.tariff_id
      left join profiles pr on pr.user_id = c.user_id
      where c.id = ${data.contractId}
    `;
    if (!row) throw new Error("Auftrag nicht gefunden");
    await assertCanSeeUser(db, me, asStr(row.user_id));
    const email = data.email.trim().toLowerCase();
    if (!email.includes("@")) throw new Error("E-Mail des Kunden fehlt.");
    const name = `${asStr(row.first_name)} ${asStr(row.last_name)}`.trim();
    const pdf = contractPdfFor({
      art: asStr(row.type) === "gas" ? "gas" : "strom",
      first: asStr(row.first_name),
      last: asStr(row.last_name),
      street: asStr(row.street),
      house: asStr(row.house_number),
      zip: asStr(row.zip),
      city: asStr(row.city),
      email,
      phone: asStr(row.phone),
      birth: asStr(row.birth_date),
      product: asStr(row.product_name) || asStr(row.tariff_id),
      kwh: String(row.consumption_kwh ?? ""),
      meter: asStr(row.meter_number),
      previous: asStr(row.previous_provider),
      start: asStr(row.start_date),
      advisor: `${asStr(row.advisor_first)} ${asStr(row.advisor_last)}`.trim(),
      iban: asStr(row.bank_iban),
      owner: asStr(row.bank_owner),
      arbeitspreis: row.work_price ? `${row.work_price} ct/kWh` : undefined,
      grundpreis: row.base_price ? `${row.base_price} EUR/Monat` : undefined,
    });
    const id = nid();
    const ready = docusignReady();
    let status = ready ? "sent" : "queued";
    let dsId: string | null = null;
    let error: string | null = null;
    if (ready) {
      try {
        dsId = await sendDocusignEnvelope({ email, name, pdf, contractId: data.contractId });
      } catch (e) {
        status = "failed";
        error = e instanceof Error ? e.message : "Versand fehlgeschlagen";
      }
    } else {
      error = "DocuSign-Keys in Render setzen. Danach denselben Auftrag erneut senden.";
    }
    await db`
      insert into sign_envelopes (
        id, contract_id, channel, provider, status, recipient_email, recipient_name,
        docusign_envelope_id, error, sent_by, sent_at
      ) values (
        ${id}, ${data.contractId}, ${"email"}, ${"docusign"}, ${status}, ${email}, ${name},
        ${dsId}, ${error}, ${context.userId}, ${status === "sent" ? new Date().toISOString() : null}
      )
    `;
    if (email !== asStr(row.email)) {
      await db`update customers set email = ${email} where id = ${asStr(row.customer_id)}`;
    }
    await audit(db, {
      userId: context.userId,
      action: "sign.email",
      entityType: "contract",
      entityId: data.contractId,
      newValues: { status, email },
    });
    if (status === "failed") throw new Error(error || "DocuSign-Fehler");
    return { id, status, queued: status === "queued" };
  });

export const saveTabletSignature = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { contractId: string; image: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const [c] = await db<Record<string, unknown>>`select user_id from contracts where id = ${data.contractId}`;
    if (!c) throw new Error("Auftrag nicht gefunden");
    await assertCanSeeUser(db, me, asStr(c.user_id));
    if (!data.image.startsWith("data:image")) throw new Error("Unterschrift fehlt.");
    const stored = await putFile(data.image, `unterschrift-${data.contractId}.png`);
    const fileId = nid();
    await db`
      insert into contract_files (id, contract_id, kind, filename, mime, path)
      values (${fileId}, ${data.contractId}, ${"tablet_signature"}, ${"unterschrift.png"}, ${"image/png"}, ${stored.path})
    `;
    const envId = nid();
    await db`
      insert into sign_envelopes (
        id, contract_id, channel, provider, status, sent_by, sent_at, completed_at, signed_file_id
      ) values (
        ${envId}, ${data.contractId}, ${"tablet"}, ${"pad"}, ${"completed"},
        ${context.userId}, now(), now(), ${fileId}
      )
    `;
    await db`update contracts set signature_confirmed = true, updated_at = now() where id = ${data.contractId}`;
    await audit(db, {
      userId: context.userId,
      action: "sign.tablet",
      entityType: "contract",
      entityId: data.contractId,
    });
    return { ok: true };
  });

export const downloadContractPdf = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { contractId: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const [row] = await db<Record<string, unknown>>`
      select c.*, cu.first_name, cu.last_name, cu.email, cu.phone, cu.street, cu.house_number,
             cu.zip, cu.city, cu.birth_date,
             coalesce(p.name, t.name) as product_name,
             p.work_price as work_price,
             p.base_price as base_price,
             pr.first_name as advisor_first, pr.last_name as advisor_last
      from contracts c
      join customers cu on cu.id = c.customer_id
      left join products p on p.id = c.product_id
      left join tariffs t on t.id = c.tariff_id
      left join profiles pr on pr.user_id = c.user_id
      where c.id = ${data.contractId}
    `;
    if (!row) throw new Error("Auftrag nicht gefunden");
    await assertCanSeeUser(db, me, asStr(row.user_id));
    const pdf = contractPdfFor({
      art: asStr(row.type) === "gas" ? "gas" : "strom",
      first: asStr(row.first_name),
      last: asStr(row.last_name),
      street: asStr(row.street),
      house: asStr(row.house_number),
      zip: asStr(row.zip),
      city: asStr(row.city),
      email: asStr(row.email),
      phone: asStr(row.phone),
      birth: asStr(row.birth_date),
      product: asStr(row.product_name),
      kwh: String(row.consumption_kwh ?? ""),
      meter: asStr(row.meter_number),
      previous: asStr(row.previous_provider),
      start: asStr(row.start_date),
      advisor: `${asStr(row.advisor_first)} ${asStr(row.advisor_last)}`.trim(),
      iban: asStr(row.bank_iban),
      owner: asStr(row.bank_owner),
      arbeitspreis: row.work_price ? `${row.work_price} ct/kWh` : undefined,
      grundpreis: row.base_price ? `${row.base_price} EUR/Monat` : undefined,
    });
    return {
      filename: `E1-Vertrag-${asStr(row.last_name) || "Kunde"}.pdf`,
      base64: pdf.toString("base64"),
    };
  });

export const previewMusterVertrag = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const lines = fillVertrag({
      art: "strom",
      first: "[Vorname]",
      last: "[Nachname]",
      street: "[Straße]",
      house: "[Nr.]",
      zip: "[PLZ]",
      city: "[Ort]",
      email: "[E-Mail]",
      phone: "[Telefon]",
      product: "[Tarif — Platzhalter]",
      kwh: "3500",
      advisor: "Orhan Salo / Luca Marco Marrancone",
    });
    return { lines, pdfBase64: contractPdfFor({
      art: "strom",
      first: "[Vorname]",
      last: "[Nachname]",
      street: "[Straße]",
      house: "[Nr.]",
      zip: "[PLZ]",
      city: "[Ort]",
      email: "[E-Mail]",
      phone: "[Telefon]",
      product: "[Tarif — Platzhalter]",
      kwh: "3500",
      advisor: "Orhan Salo / Luca Marco Marrancone",
    }).toString("base64") };
  });
