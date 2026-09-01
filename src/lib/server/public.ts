import { createServerFn } from "@tanstack/react-start";
import { nid } from "@/lib/utils";
import { sql } from "./helpers";
import { MAIL_DOMAIN } from "@/lib/mail";

export const getPublicContact = createServerFn({ method: "GET" }).handler(async () => {
  const envPhone = (process.env.PUBLIC_PHONE || process.env.E1_PUBLIC_PHONE || "").trim();
  let phone = envPhone;
  let label = "Satellite-Festnetz";
  try {
    const db = await sql();
    const rows = await db<{ key: string; value: string }>`
      select key, value from settings where key in ('public_phone', 'public_phone_label')
    `;
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    if ((map.public_phone || "").trim()) phone = map.public_phone.trim();
    if ((map.public_phone_label || "").trim()) label = map.public_phone_label.trim();
  } catch {
    /* Settings optional */
  }
  return {
    email: `info@${MAIL_DOMAIN}`,
    phone,
    label,
  };
});

export const submitLead = createServerFn({ method: "POST" })
  .validator((d: { name: string; phone: string; zip?: string; message?: string; consent: boolean }) => d)
  .handler(async ({ data }) => {
    if (!data.name?.trim() || !data.phone?.trim()) throw new Error("Name und Telefon sind Pflicht.");
    if (!data.consent) throw new Error("Bitte der Datenverarbeitung zustimmen.");
    const db = await sql();
    await db`
      insert into leads (id, name, phone, zip, message)
      values (${nid()}, ${data.name.trim()}, ${data.phone.trim()}, ${data.zip?.trim() || null}, ${data.message?.trim() || null})
    `;
    try {
      const { queuePortalMail } = await import("./workspace.server");
      const text = `Name: ${data.name.trim()}\nTelefon: ${data.phone.trim()}\nPLZ: ${data.zip?.trim() || "—"}\n\n${data.message?.trim() || ""}`;
      await queuePortalMail(db, {
        from: `info@${MAIL_DOMAIN}`,
        to: `info@${MAIL_DOMAIN}, orhan.salo@${MAIL_DOMAIN}, luca.marrancone@${MAIL_DOMAIN}`,
        subject: `Neue Beratung · ${data.name.trim()}`,
        text,
        purpose: "lead",
      });
    } catch {
      /* queued when Workspace verbunden */
    }
    try {
      const { notify } = await import("./helpers");
      const admins = await db<{ user_id: string }>`select user_id from profiles where role = 'super_admin'`;
      for (const a of admins) {
        await notify(db, {
          userId: a.user_id,
          type: "lead",
          title: "Neue Beratungsanfrage",
          message: `${data.name.trim()} · ${data.phone.trim()}`,
          link: "/portal/admin/leads",
        });
      }
    } catch {
      /* notifications optional */
    }
    try {
      const { ingestMessage } = await import("./mailbox.server");
      await ingestMessage(db, {
        mailbox: "info",
        direction: "in",
        from_address: `${data.name.trim().toLowerCase().replace(/\s+/g, ".")}@anfrage.e1direktvertrieb.de`,
        from_name: data.name.trim(),
        to_addresses: `info@${MAIL_DOMAIN}`,
        subject: `Neue Beratung · ${data.name.trim()}`,
        body_text: `Name: ${data.name.trim()}\nTelefon: ${data.phone.trim()}\nPLZ: ${data.zip?.trim() || "—"}\n\n${data.message?.trim() || ""}`,
        unread: true,
        folder: "inbox",
      });
    } catch {
      /* inbox table after migration */
    }
    return { ok: true };
  });

export const submitApplication = createServerFn({ method: "POST" })
  .validator(
    (d: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      position: string;
      motivation: string;
      consent: boolean;
    }) => d,
  )
  .handler(async ({ data }) => {
    if (!data.firstName?.trim() || !data.lastName?.trim()) throw new Error("Name ist Pflicht.");
    if (!data.email?.includes("@")) throw new Error("E-Mail ist ungültig.");
    if (!data.phone?.trim()) throw new Error("Telefon ist Pflicht.");
    if (!data.motivation?.trim()) throw new Error("Bitte schreiben Sie ein paar Zeilen zu Ihrer Motivation.");
    if (!data.consent) throw new Error("Bitte der Datenverarbeitung zustimmen.");
    const db = await sql();
    await db`
      insert into career_applications (id, first_name, last_name, email, phone, position, motivation)
      values (
        ${nid()}, ${data.firstName.trim()}, ${data.lastName.trim()}, ${data.email.trim()},
        ${data.phone.trim()}, ${data.position || "Vertriebsmitarbeiter (m/w/d)"}, ${data.motivation.trim()}
      )
    `;
    try {
      const { queuePortalMail } = await import("./workspace.server");
      await queuePortalMail(db, {
        from: `bewerbung@${MAIL_DOMAIN}`,
        to: `bewerbung@${MAIL_DOMAIN}, orhan.salo@${MAIL_DOMAIN}, luca.marrancone@${MAIL_DOMAIN}`,
        subject: `Bewerbung · ${data.firstName.trim()} ${data.lastName.trim()} · ${data.position}`,
        text: `${data.firstName.trim()} ${data.lastName.trim()}\n${data.email.trim()}\n${data.phone.trim()}\n${data.position}\n\n${data.motivation.trim()}`,
        purpose: "bewerbung",
      });
    } catch {
      /* queued */
    }
    try {
      const { ingestMessage } = await import("./mailbox.server");
      await ingestMessage(db, {
        mailbox: "bewerbung",
        direction: "in",
        from_address: data.email.trim(),
        from_name: `${data.firstName.trim()} ${data.lastName.trim()}`,
        to_addresses: `bewerbung@${MAIL_DOMAIN}`,
        subject: `Bewerbung · ${data.firstName.trim()} ${data.lastName.trim()} · ${data.position}`,
        body_text: `${data.firstName.trim()} ${data.lastName.trim()}\n${data.email.trim()}\n${data.phone.trim()}\n${data.position}\n\n${data.motivation.trim()}`,
        unread: true,
        folder: "inbox",
      });
    } catch {
      /* inbox table after migration */
    }
    return { ok: true };
  });

export const customerSelfLookup = createServerFn({ method: "POST" })
  .validator((d: { lastName: string; zip: string; contractId: string }) => d)
  .handler(async ({ data }) => {
    const db = await sql();
    const flags = await db<{ enabled: boolean }>`select enabled from feature_flags where key = 'phase2_self_service'`;
    if (!flags[0]?.enabled) throw new Error("Kundenportal ist noch nicht aktiv.");
    const [row] = await db<Record<string, unknown>>`
      select c.id, c.status, c.type, c.start_date, p.name as product_name,
             cu.first_name, cu.last_name, cu.city
      from contracts c
      join customers cu on cu.id = c.customer_id
      left join products p on p.id = c.product_id
      where c.id = ${data.contractId.trim()}
        and lower(cu.last_name) = ${data.lastName.trim().toLowerCase()}
        and cu.zip = ${data.zip.trim()}
    `;
    if (!row) throw new Error("Kein Vertrag gefunden. Prüfen Sie Auftragsnummer, Name und PLZ.");
    return {
      id: String(row.id),
      status: String(row.status),
      type: String(row.type),
      start_date: row.start_date ? String(row.start_date) : null,
      product_name: String(row.product_name ?? ""),
      name: `${row.first_name} ${row.last_name}`,
      city: String(row.city ?? ""),
    };
  });
