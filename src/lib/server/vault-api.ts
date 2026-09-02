import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { asStr } from "@/lib/utils";
import { requireProfile, sql, visibleUserIds } from "./helpers";
import { unlockContract } from "./vault.server";

export const listDashboardContracts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const ids = await visibleUserIds(db, me);
    const rows = ids
      ? await db<Record<string, unknown>>`
      select c.id, c.status, c.created_at,
             cu.first_name, cu.last_name, cu.street, cu.house_number, cu.zip, cu.city,
             exists(select 1 from contract_locks l where l.contract_id = c.id) as locked
      from contracts c
      join customers cu on cu.id = c.customer_id
      where c.advisor_id = any(${ids}::text[])
      order by c.created_at desc
      limit 40
    `
      : await db<Record<string, unknown>>`
      select c.id, c.status, c.created_at,
             cu.first_name, cu.last_name, cu.street, cu.house_number, cu.zip, cu.city,
             exists(select 1 from contract_locks l where l.contract_id = c.id) as locked
      from contracts c
      join customers cu on cu.id = c.customer_id
      order by c.created_at desc
      limit 40
    `;
    return rows.map((r) => ({
      id: asStr(r.id),
      name: `${asStr(r.first_name)} ${asStr(r.last_name)}`.trim(),
      address: `${asStr(r.street)} ${asStr(r.house_number)}, ${asStr(r.zip)} ${asStr(r.city)}`,
      status: asStr(r.status),
      locked: Boolean(r.locked),
      created_at: asStr(r.created_at),
    }));
  });

export const revealContract = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string; password: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    await requireProfile(db, context.userId);
    return unlockContract(db, data.id, data.password);
  });
