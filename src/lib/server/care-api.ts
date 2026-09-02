import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { can } from "@/lib/e1";
import { asStr, nid } from "@/lib/utils";
import { notify, requireProfile, sql } from "./helpers";

async function ensureCare(db: Awaited<ReturnType<typeof sql>>) {
  const rows = await db<{ id: string; customer_id: string; created_at: Date }>`
    select id, customer_id, created_at from contracts
    where status not in ('storniert')
      and created_at < now() - interval '10 months'
  `;
  for (const r of rows) {
    const due = new Date(r.created_at);
    due.setFullYear(due.getFullYear() + 1);
    const dueStr = due.toISOString().slice(0, 10);
    await db`
      insert into customer_care (id, customer_id, contract_id, due_on)
      values (${nid()}, ${r.customer_id}, ${r.id}, ${dueStr}::date)
      on conflict (contract_id) do nothing
    `;
  }
}

export const listCare = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "users.manage")) throw new Error("Nur Leitung");
    await ensureCare(db);
    const rows = await db<Record<string, unknown>>`
      select c.id, c.due_on, c.status, c.contract_id, co.created_at as first_at,
             cu.first_name, cu.last_name, cu.phone, cu.email, cu.street, cu.house_number, cu.zip, cu.city
      from customer_care c
      join customers cu on cu.id = c.customer_id
      left join contracts co on co.id = c.contract_id
      where c.status = 'offen'
      order by c.due_on asc
      limit 200
    `;
    return rows.map((r) => ({
      id: asStr(r.id),
      contract_id: asStr(r.contract_id),
      due_on: asStr(r.due_on).slice(0, 10),
      first_at: asStr(r.first_at).slice(0, 10),
      first_name: asStr(r.first_name),
      last_name: asStr(r.last_name),
      name: `${asStr(r.first_name)} ${asStr(r.last_name)}`.trim(),
      phone: asStr(r.phone),
      email: asStr(r.email),
      street: asStr(r.street),
      house: asStr(r.house_number),
      zip: asStr(r.zip),
      city: asStr(r.city),
    }));
  });

export const nudgeCare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "users.manage")) throw new Error("Nur Leitung");
    await ensureCare(db);
    const soon = await db<{ n: string }>`
      select count(*)::text as n from customer_care
      where status = 'offen' and due_on <= (current_date + 7)
    `;
    const n = Number(soon[0]?.n || 0);
    if (n) {
      const bosses = await db<{ user_id: string }>`select user_id from profiles where role = 'super_admin' and status = 'active'`;
      for (const b of bosses) {
        await notify(db, {
          userId: b.user_id,
          type: "pflege",
          title: `Vergünstigung möglich`,
          message: `${n} Kunden. Vertrag senden oder anrufen.`,
          link: "/portal/pflege",
        });
        try {
          const { sendPushToUser } = await import("./push.server");
          await sendPushToUser(db, b.user_id, {
            title: `${n} Kunden vor dem Jahrestag`,
            body: "Pflege öffnen.",
            url: "/portal/pflege",
          });
        } catch {
          /* */
        }
      }
    }
    return { n };
  });

export const mailCare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!can(me.role, "users.manage")) throw new Error("Nur Leitung");
    const [row] = await db<{ email: string; first_name: string; last_name: string }>`
      select cu.email, cu.first_name, cu.last_name
      from customer_care c
      join customers cu on cu.id = c.customer_id
      where c.id = ${data.id}
    `;
    if (!row?.email) throw new Error("Keine E-Mail.");
    const { gmailAppPasswordReady, sendViaAppPassword } = await import("./smtp-gmail.server");
    if (!gmailAppPasswordReady()) throw new Error("Mail in Render nicht bereit.");
    await sendViaAppPassword({
      to: row.email,
      subject: "Ihre Preisgarantie — wir holen die Erhöhung raus",
      text: `Guten Tag ${row.first_name} ${row.last_name},\n\nIhr Vertrag läuft auf das Jahr zu. In der Praxis steigen viele Tarife nach zwölf Monaten.\n\nWir prüfen für Sie eine neue Preisgarantie und eine Reduzierung zum nächsten Monat. Dafür brauchen wir nur Ihre kurze Bestätigung — den neuen Vertrag senden wir per DocuSign, Sie unterschreiben digital, der Rest läuft bei uns.\n\nFreundliche Grüße\nE1 Direktvertrieb\nOrhan Salo und Luca-Marco Marrancone\n`,
    });
    await db`update customer_care set last_mail_at = now() where id = ${data.id}`;
    return { ok: true };
  });

export const doneCare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    await requireProfile(db, context.userId);
    await db`update customer_care set status = 'erledigt' where id = ${data.id}`;
    return { ok: true };
  });
