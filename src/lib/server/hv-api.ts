import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { can } from "@/lib/e1";
import { fillHvVertrag, fillHvProvisionSheet, musterHvInput, type HvInput } from "@/lib/hv-vertrag";
import { buildPagedPdf } from "@/lib/sign";
import { nid } from "@/lib/utils";
import { docusignReady, pollPendingSignatures, sendDocusignEnvelope } from "./docusign.server";
import { gmailAppPasswordReady, gmailSmtpUser, sendViaAppPassword } from "./smtp-gmail.server";
import { putFile } from "./ops.server";
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
    if (!data.street?.trim() || !data.house?.trim() || !data.zip?.trim() || !data.city?.trim()) {
      throw new Error("Vollständige Adresse fehlt.");
    }
    if (!data.staffId?.trim()) throw new Error("Mitarbeiter-ID fehlt.");
    if (!data.email?.trim()) throw new Error("E-Mail fehlt.");
    if (!data.phone?.trim()) throw new Error("Telefon fehlt.");
    if (!data.start?.trim()) throw new Error("Vertragsbeginn fehlt.");
    if (!data.birth?.trim()) throw new Error("Geburtsdatum fehlt.");
    if (!data.taxId?.trim()) throw new Error("Steuer-ID fehlt.");
    if (!data.tradeNo?.trim()) throw new Error("Gewerbeanmeldung fehlt.");
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
    const pdf = buildPagedPdf(lines, "Handelsvertretervertrag");
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
    await pollPendingSignatures().catch(() => null);
    const rows = await db<{
      id: string;
      staff_id: string | null;
      first_name: string;
      last_name: string;
      city: string | null;
      stufe: number;
      created_at: string;
      signed_at: string | null;
      signed_channel: string | null;
      email: string | null;
      signed_by_company: boolean | null;
      signed_by_agent: boolean | null;
    }>`
      select id, staff_id, first_name, last_name, city, stufe, created_at, signed_at, signed_channel, email,
             signed_by_company, signed_by_agent
      from staff_contracts
      order by created_at desc
      limit 80
    `;
    return rows;
  });

export const getHvContract = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "users.manage") && !can(me.role, "settings.manage")) {
      throw new Error("Kein Zugriff");
    }
    const [row] = await db<Record<string, unknown>>`
      select * from staff_contracts where id = ${data.id}
    `;
    if (!row) throw new Error("Vertrag nicht gefunden.");
    const body = String(row.body || "");
    const lines = body.split("\n");
    const pdf = buildPagedPdf(lines, "Handelsvertretervertrag");
    return {
      id: String(row.id),
      user_id: row.user_id ? String(row.user_id) : null,
      staff_id: row.staff_id ? String(row.staff_id) : null,
      first_name: String(row.first_name || ""),
      last_name: String(row.last_name || ""),
      street: String(row.street || ""),
      house_number: String(row.house_number || ""),
      zip: String(row.zip || ""),
      city: String(row.city || ""),
      email: row.email ? String(row.email) : null,
      phone: row.phone ? String(row.phone) : null,
      region: row.region ? String(row.region) : null,
      start_date: row.start_date ? String(row.start_date) : null,
      stufe: Number(row.stufe) || 1,
      signed_at: row.signed_at ? String(row.signed_at) : null,
      signed_channel: row.signed_channel ? String(row.signed_channel) : null,
      created_at: String(row.created_at || ""),
      lines,
      filename: downloadName(String(row.last_name || "HV"), String(row.id)),
      pdfBase64: pdf.toString("base64"),
    };
  });

export const deleteHvContract = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "users.manage") && !can(me.role, "settings.manage")) {
      throw new Error("Kein Zugriff");
    }
    const [row] = await db<{ id: string; first_name: string; last_name: string }>`
      select id, first_name, last_name from staff_contracts where id = ${data.id}
    `;
    if (!row) throw new Error("Vertrag nicht gefunden.");
    await db`update profiles set hv_contract_id = null where hv_contract_id = ${data.id}`;
    await db`delete from sign_envelopes where staff_contract_id = ${data.id}`;
    await db`delete from staff_contract_files where staff_contract_id = ${data.id}`;
    await db`delete from staff_contracts where id = ${data.id}`;
    return { ok: true, name: `${row.first_name} ${row.last_name}` };
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
    const pdf = buildPagedPdf(row.body.split("\n"), "Handelsvertretervertrag");
    return { filename: downloadName(row.last_name, row.id), pdfBase64: pdf.toString("base64") };
  });

export const sendHvSignEmail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string; email?: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "users.manage") && !can(me.role, "settings.manage")) {
      throw new Error("Kein Zugriff");
    }
    const [row] = await db<{
      id: string;
      first_name: string;
      last_name: string;
      email: string | null;
      body: string;
    }>`
      select id, first_name, last_name, email, body from staff_contracts where id = ${data.id}
    `;
    if (!row) throw new Error("Vertrag nicht gefunden.");
    const email = (data.email || row.email || "").trim().toLowerCase();
    if (!email.includes("@")) throw new Error("E-Mail des Handelsvertreters fehlt.");
    const name = `${row.first_name} ${row.last_name}`.trim();
    const pdf = buildPagedPdf(row.body.split("\n"), "Handelsvertretervertrag");
    const envId = nid();
    const ready = docusignReady();
    let status = ready ? "sent" : "queued";
    let dsId: string | null = null;
    let error: string | null = null;
    if (ready) {
      try {
        dsId = await sendDocusignEnvelope({
          email,
          name,
          pdf,
          contractId: row.id,
          subject: "Ihr E1-Handelsvertretervertrag zur Unterschrift",
          blurb: "Zuerst unterschreibt E1, danach Sie. Das fertige PDF liegt danach in der Datenbank.",
          filename: downloadName(row.last_name, row.id),
          companyEmail: "business@e1direktvertrieb.de",
          companyName: "E1 Direktvertrieb",
        });
      } catch (e) {
        status = "failed";
        error = e instanceof Error ? e.message : "DocuSign-Fehler";
      }
    }
    await db`
      insert into sign_envelopes (
        id, contract_id, staff_contract_id, channel, provider, status,
        recipient_email, recipient_name, docusign_envelope_id, error, sent_by, sent_at
      ) values (
        ${envId}, null, ${row.id}, 'email', 'docusign', ${status},
        ${email}, ${name}, ${dsId}, ${error}, ${context.userId}, now()
      )
    `;
    await db`update staff_contracts set signer_email = ${email} where id = ${row.id}`;
    if (status === "failed") throw new Error(error || "Versand fehlgeschlagen.");
    return { ok: true, status, queued: !ready };
  });

export const saveHvTabletSign = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string; signatureData: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "users.manage") && !can(me.role, "settings.manage")) {
      throw new Error("Kein Zugriff");
    }
    if (!data.signatureData?.startsWith("data:image")) throw new Error("Unterschrift fehlt.");
    const [row] = await db<{ id: string }>`select id from staff_contracts where id = ${data.id}`;
    if (!row) throw new Error("Vertrag nicht gefunden.");
    const stored = await putFile(data.signatureData, `hv-tablet-${row.id}.png`);
    const fileId = nid();
    await db`
      insert into staff_contract_files (id, staff_contract_id, kind, filename, mime, path)
      values (${fileId}, ${row.id}, ${"tablet_sign"}, ${stored.path.split("/").pop() || "sign.png"}, ${"image/png"}, ${stored.path})
    `;
    await db`
      update staff_contracts
      set signed_at = now(), signed_channel = 'tablet', signed_by_agent = true
      where id = ${row.id}
    `;
    await db`
      insert into sign_envelopes (
        id, contract_id, staff_contract_id, channel, provider, status, sent_by, sent_at, completed_at, signed_file_id
      ) values (
        ${nid()}, null, ${row.id}, 'tablet', 'tablet', 'completed', ${context.userId}, now(), now(), ${fileId}
      )
    `;
    return { ok: true };
  });

export const previewMusterHv = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const lines = fillHvVertrag(musterHvInput());
    const pdf = buildPagedPdf(lines, "Muster Handelsvertretervertrag");
    return {
      filename: "E1-Muster-Handelsvertretervertrag.pdf",
      pdfBase64: pdf.toString("base64"),
      lines,
    };
  });

async function currentBands(db: Awaited<ReturnType<typeof sql>>) {
  const bands = await db<{
    provider: string;
    name: string;
    type: string;
    kwh_from: number;
    kwh_to: number;
    amount_eur: string | number;
    amount_ct_kwh: string | number;
  }>`
    select t.provider, t.name, t.type, b.kwh_from, b.kwh_to, b.amount_eur, b.amount_ct_kwh
    from tariff_bands b
    join tariffs t on t.id = b.tariff_id
    where b.stufe = 1 and t.active = true
    order by t.provider, t.name, b.kwh_from
  `;
  return bands.map((b) => ({
    provider: b.provider,
    name: b.name,
    type: b.type,
    kwh_from: Number(b.kwh_from),
    kwh_to: Number(b.kwh_to),
    amount_eur: Number(b.amount_eur),
    amount_ct_kwh: Number(b.amount_ct_kwh),
  }));
}

export const sendHvProvisionMail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { email: string; first?: string; last?: string; staffId?: string; region?: string; id?: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "users.manage") && !can(me.role, "settings.manage")) {
      throw new Error("Kein Zugriff");
    }
    const email = data.email.trim().toLowerCase();
    if (!email.includes("@")) throw new Error("E-Mail fehlt.");
    if (!gmailAppPasswordReady()) {
      throw new Error("GMAIL_APP_PASSWORD in Render setzen, sonst geht der Versand nicht.");
    }
    let input: HvInput = {
      first: data.first || "Handelsvertreter",
      last: data.last || "",
      street: "",
      house: "",
      zip: "",
      city: "",
      email,
      staffId: data.staffId,
      region: data.region,
      stufe: 1,
    };
    if (data.id) {
      const [row] = await db<Record<string, unknown>>`select * from staff_contracts where id = ${data.id}`;
      if (row) {
        input = {
          first: String(row.first_name || input.first),
          last: String(row.last_name || ""),
          street: String(row.street || ""),
          house: String(row.house_number || ""),
          zip: String(row.zip || ""),
          city: String(row.city || ""),
          email,
          staffId: String(row.staff_id || ""),
          region: String(row.region || ""),
          stufe: Number(row.stufe) || 1,
        };
      }
    }
    input.bands = await currentBands(db);
    const lines = fillHvProvisionSheet(input);
    const pdf = buildPagedPdf(lines, "Provisionsordnung");
    const filename = `E1-Provisionsordnung-${(input.last || "HV").replace(/[^a-zA-Z0-9_-]+/g, "")}.pdf`;
    await sendViaAppPassword({
      to: email,
      from: gmailSmtpUser(),
      subject: "Ihre E1-Provisionsordnung (Stufe 1)",
      text: [
        `Guten Tag ${input.first} ${input.last},`.trim() + ",",
        "",
        "anbei die aktuelle Provisionsordnung Stufe 1 als PDF.",
        "Sie ist Anlage zum Handelsvertretervertrag und gilt ab Vertragsbeginn.",
        "",
        "E1 Direktvertrieb",
        "Orhan Salo und Luca-Marco Marrancone",
      ].join("\n"),
      filename,
      pdf,
    });
    return { ok: true, to: email, filename };
  });

export const pollHvSignatures = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "users.manage") && !can(me.role, "settings.manage")) {
      throw new Error("Kein Zugriff");
    }
    return pollPendingSignatures();
  });
