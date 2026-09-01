import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { can, type Role } from "@/lib/e1";
import { asStr, nid, num } from "@/lib/utils";
import { vatOn } from "@/lib/steuer";
import { audit, notify, requireProfile, sql } from "./helpers";

function canPay(role: Role) {
  return can(role, "commissions.pay");
}

function isoWeekTitle(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `Auszahlung KW ${String(week).padStart(2, "0")} / ${t.getUTCFullYear()}`;
}

export const listPayoutRuns = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!canPay(me.role) && !can(me.role, "commissions.approve") && !can(me.role, "reports.export")) {
      return [];
    }
    const rows = await db<Record<string, unknown>>`
      select r.*,
        (select count(*)::int from payout_items i where i.run_id = r.id) as items,
        (select coalesce(sum(i.amount),0) from payout_items i where i.run_id = r.id) as total
      from payout_runs r
      order by r.scheduled_for desc, r.created_at desc
      limit 40
    `;
    return rows.map((r) => ({
      id: asStr(r.id),
      title: asStr(r.title),
      scheduled_for: asStr(r.scheduled_for).slice(0, 10),
      status: asStr(r.status),
      note: asStr(r.note),
      items: num(r.items),
      total: num(r.total),
      executed_at: r.executed_at ? asStr(r.executed_at) : null,
      created_at: asStr(r.created_at),
    }));
  });

export const planPayout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { ids: string[]; scheduledFor: string; title?: string; note?: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!canPay(me.role)) throw new Error("Keine Berechtigung für Auszahlungen.");
    if (!data.ids?.length) throw new Error("Keine Positionen gewählt.");
    const day = (data.scheduledFor || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Termin fehlt.");
    const comms = await db<Record<string, unknown>>`
      select c.id, c.user_id, c.amount, c.status
      from commissions c
      where c.id = any(${data.ids})
    `;
    if (comms.length !== data.ids.length) throw new Error("Position nicht gefunden.");
    for (const c of comms) {
      if (asStr(c.status) !== "freigegeben") {
        throw new Error("Nur freigegebene Provisionen können geplant werden.");
      }
    }
    const taken = await db<{ commission_id: string }>`
      select i.commission_id
      from payout_items i
      join payout_runs r on r.id = i.run_id
      where i.commission_id = any(${data.ids}) and r.status = 'geplant'
    `;
    if (taken.length) throw new Error("Mindestens eine Position ist schon in einem geplanten Lauf.");
    const id = nid();
    const title = (data.title || "").trim() || isoWeekTitle(new Date(day + "T12:00:00"));
    await db`
      insert into payout_runs (id, title, scheduled_for, status, note, created_by)
      values (${id}, ${title}, ${day}, ${"geplant"}, ${data.note?.trim() || null}, ${context.userId})
    `;
    const seenUsers = new Set<string>();
    for (const c of comms) {
      await db`
        insert into payout_items (id, run_id, commission_id, user_id, amount)
        values (${nid()}, ${id}, ${asStr(c.id)}, ${asStr(c.user_id)}, ${num(c.amount)})
      `;
      seenUsers.add(asStr(c.user_id));
    }
    for (const uid of seenUsers) {
      await notify(db, {
        userId: uid,
        type: "payout",
        title: "Auszahlung terminiert",
        message: `${title} am ${day.split("-").reverse().join(".")}`,
        link: "/portal/provisionen",
      });
    }
    await audit(db, {
      userId: context.userId,
      action: "payout.plan",
      entityType: "payout_run",
      entityId: id,
      newValues: { items: comms.length, scheduledFor: day },
    });
    return { id, items: comms.length, title };
  });

export const executePayout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!canPay(me.role)) throw new Error("Keine Berechtigung für Auszahlungen.");
    const [run] = await db<Record<string, unknown>>`
      select * from payout_runs where id = ${data.id}
    `;
    if (!run) throw new Error("Lauf nicht gefunden.");
    if (asStr(run.status) !== "geplant") throw new Error("Lauf ist nicht mehr geplant.");
    const items = await db<{ commission_id: string; user_id: string; amount: string }>`
      select commission_id, user_id, amount from payout_items where run_id = ${data.id}
    `;
    if (!items.length) throw new Error("Lauf ist leer.");
    const ids = items.map((i) => i.commission_id);
    await db`
      update commissions
      set status = 'ausgezahlt', paid_at = now()
      where id = any(${ids}) and status = 'freigegeben'
    `;
    await db`
      update payout_runs
      set status = 'ausgefuehrt', executed_by = ${context.userId}, executed_at = now()
      where id = ${data.id}
    `;
    const users = [...new Set(items.map((i) => i.user_id))];
    for (const uid of users) {
      const sum = items.filter((i) => i.user_id === uid).reduce((a, i) => a + Number(i.amount), 0);
      let message = `${asStr(run.title)}: ${sum.toFixed(2)} EUR`;
      try {
        const { annualizeExpense, payoutHintText, payoutSetAside } = await import("@/lib/steuer");
        const [set] = await db<{ kleinunternehmer: boolean }>`
          select kleinunternehmer from tax_settings where user_id = ${uid}
        `;
        const [ytd] = await db<{ paid: string }>`
          select coalesce(sum(amount) filter (where status = 'ausgezahlt'), 0)::text as paid
          from commissions
          where user_id = ${uid}
            and calculated_at >= ${`${new Date().getFullYear()}-01-01`}::date
        `;
        const exps = await db<{ amount: string; cadence: string | null; category: string }>`
          select amount, cadence, category from tax_expenses
          where user_id = ${uid} and coalesce(scope, 'user') = 'user'
            and spent_on >= ${`${new Date().getFullYear()}-01-01`}::date
        `;
        const monthlyFix = exps
          .filter((e) => asStr(e.cadence) === "monat")
          .reduce((a, e) => a + Number(e.amount), 0);
        const yearlyBa = exps.reduce((a, e) => a + annualizeExpense(Number(e.amount), asStr(e.cadence) || "einmal"), 0);
        const paidYtd = Math.max(0, num(ytd?.paid) - sum);
        const aside = payoutSetAside({
          payout: sum,
          paidYtd,
          kleinunternehmer: set ? Boolean(set.kleinunternehmer) : true,
          monthlyFix,
          yearlyBa,
        });
        message = payoutHintText(sum, aside);
      } catch {
        message = `${asStr(run.title)}: ${sum.toFixed(2)} EUR. Steuerbuch prüfen, wie viel zur Seite gelegt wird.`;
      }
      await notify(db, {
        userId: uid,
        type: "payout",
        title: "Auszahlung durchgeführt",
        message,
        link: "/portal/provisionen",
      });
    }
    await audit(db, {
      userId: context.userId,
      action: "payout.execute",
      entityType: "payout_run",
      entityId: data.id,
      newValues: { items: items.length },
    });
    return { ok: true, items: items.length };
  });

export const cancelPayout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!canPay(me.role)) throw new Error("Keine Berechtigung.");
    const [run] = await db<{ status: string }>`select status from payout_runs where id = ${data.id}`;
    if (!run) throw new Error("Lauf nicht gefunden.");
    if (run.status !== "geplant") throw new Error("Nur geplante Läufe lassen sich streichen.");
    await db`update payout_runs set status = 'storniert' where id = ${data.id}`;
    await db`delete from payout_items where run_id = ${data.id}`;
    await audit(db, {
      userId: context.userId,
      action: "payout.cancel",
      entityType: "payout_run",
      entityId: data.id,
    });
    return { ok: true };
  });

export const payoutCsv = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!canPay(me.role) && !can(me.role, "reports.export")) throw new Error("Kein Export.");
    const [run] = await db<Record<string, unknown>>`select * from payout_runs where id = ${data.id}`;
    if (!run) throw new Error("Lauf nicht gefunden.");
    const rows = await db<Record<string, unknown>>`
      select p.first_name, p.last_name, p.staff_id, cm.type, cm.amount, cm.status, c.last_name as customer
      from payout_items i
      join commissions cm on cm.id = i.commission_id
      join profiles p on p.user_id = i.user_id
      left join contracts c on c.id = cm.contract_id
      where i.run_id = ${data.id}
      order by p.last_name, p.first_name
    `;
    const header = "Mitarbeiter-ID;Berater;Typ;Kunde;Netto;USt 19%;Brutto;Status";
    const body = rows
      .map((r) => {
        const v = vatOn(num(r.amount));
        return `${asStr(r.staff_id)};${asStr(r.first_name)} ${asStr(r.last_name)};${asStr(r.type)};${asStr(r.customer)};${v.net.toFixed(2).replace(".", ",")};${v.vat.toFixed(2).replace(".", ",")};${v.gross.toFixed(2).replace(".", ",")};${asStr(r.status)}`;
      })
      .join("\n");
    return {
      filename: `E1-Auszahlung-${asStr(run.scheduled_for).slice(0, 10)}.csv`,
      csv: `${header}\n${body}\n`,
    };
  });
