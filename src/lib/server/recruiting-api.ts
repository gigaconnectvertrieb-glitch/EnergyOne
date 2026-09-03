import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { asStr, nid } from "@/lib/utils";
import { requireProfile, sql } from "./helpers";

export const createRecruit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { firstName: string; lastName: string; phone?: string; email?: string; job?: string; note?: string }) => d)
  .handler(async ({ context, data }) => {
    const first = data.firstName.trim();
    const last = data.lastName.trim();
    if (!first || !last) throw new Error("Name fehlt.");
    if (!data.phone?.trim() && !data.email?.trim()) throw new Error("Telefon oder E-Mail.");
    const db = await sql();
    await db`
      create table if not exists recruiting_leads (
        id text primary key,
        first_name text not null default '',
        last_name text not null default '',
        phone text not null default '',
        email text not null default '',
        job text not null default '',
        note text not null default '',
        status text not null default 'neu',
        created_by text,
        created_at timestamptz not null default now()
      )
    `;
    const id = nid();
    await db`
      insert into recruiting_leads (id, first_name, last_name, phone, email, job, note, created_by)
      values (
        ${id}, ${first}, ${last}, ${data.phone?.trim() || ""}, ${data.email?.trim() || ""},
        ${data.job?.trim() || ""}, ${data.note?.trim() || ""}, ${context.userId}
      )
    `;
    if (data.email?.includes("@")) {
      try {
        const { gmailAppPasswordReady, sendViaAppPassword } = await import("./smtp-gmail.server");
        if (gmailAppPasswordReady()) {
          await sendViaAppPassword({
            to: data.email.trim(),
            subject: "E1 Direktvertrieb · wir haben Ihre Daten",
            text: `Guten Tag ${first} ${last},\n\nwir haben Ihre Kontaktdaten aufgenommen. Jemand aus der Leitung meldet sich.\n\nE1 Direktvertrieb\n`,
          });
        }
      } catch {
        /* Mail optional */
      }
    }
    return { id };
  });

export const listRecruits = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    await requireProfile(db, context.userId);
    const rows = await db<Record<string, unknown>>`
      select r.*, p.first_name as by_first, p.last_name as by_last
      from recruiting_leads r
      left join profiles p on p.user_id = r.created_by
      order by r.created_at desc
      limit 200
    `;
    return rows.map((r) => ({
      id: asStr(r.id),
      first_name: asStr(r.first_name),
      last_name: asStr(r.last_name),
      phone: asStr(r.phone),
      email: asStr(r.email),
      job: asStr(r.job),
      note: asStr(r.note),
      status: asStr(r.status),
      by: `${asStr(r.by_first)} ${asStr(r.by_last)}`.trim(),
      created_at: asStr(r.created_at),
    }));
  });

export const setRecruitStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string; status: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    await requireProfile(db, context.userId);
    await db`update recruiting_leads set status = ${data.status} where id = ${data.id}`;
    return { ok: true };
  });
