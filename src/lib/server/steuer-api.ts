import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  baAmount,
  elsterCsv,
  ELSTER_URL,
  EST_FREE,
  estReserve,
  EXPENSE_CATS,
  isExpenseCat,
  leftover,
  reminders,
  splitMoney,
  STEUER_YEAR,
  ustVa,
  UST_RATE,
  vatQuarter,
  type ExpenseCat,
} from "@/lib/steuer";
import { asStr, nid, num } from "@/lib/utils";
import { requireProfile, sql } from "./helpers";

export const getSteuer = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const year = STEUER_YEAR;
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    const [set] = await db<Record<string, unknown>>`
      select * from tax_settings where user_id = ${me.user_id}
    `;
    const kleinunternehmer = set ? Boolean(set.kleinunternehmer) : true;
    const dauerfrist = set ? Boolean(set.dauerfrist) : false;
    const rows = await db<Record<string, unknown>>`
      select * from tax_expenses
      where user_id = ${me.user_id} and spent_on >= ${start} and spent_on <= ${end}
      order by spent_on desc
      limit 200
    `;
    const [cm] = await db<{ paid: string; offen: string }>`
      select
        coalesce(sum(amount) filter (where status = 'ausgezahlt'), 0)::text as paid,
        coalesce(sum(amount) filter (where status in ('offen','freigegeben')), 0)::text as offen
      from commissions
      where user_id = ${me.user_id}
        and calculated_at >= ${`${year}-01-01`}::date
        and calculated_at < ${`${year + 1}-01-01`}::date
    `;
    const expenses = rows.map((r) => {
      const cat = isExpenseCat(asStr(r.category)) ? (asStr(r.category) as ExpenseCat) : "sonstiges";
      const split = splitMoney(num(r.amount), num(r.vat_rate), Boolean(r.gross));
      return {
        id: asStr(r.id),
        spent_on: asStr(r.spent_on).slice(0, 10),
        category: cat,
        label: EXPENSE_CATS[cat].label,
        amount: num(r.amount),
        vat_rate: num(r.vat_rate),
        gross: Boolean(r.gross),
        km: r.km != null ? num(r.km) : null,
        note: asStr(r.note),
        net: split.net,
        vat: split.vat,
        ba: baAmount(cat, split.net),
        private: !EXPENSE_CATS[cat].ba,
      };
    });
    const cash = expenses.reduce((a, e) => a + e.amount, 0);
    const ba = expenses.reduce((a, e) => a + e.ba, 0);
    const vorsteuer = kleinunternehmer ? 0 : expenses.reduce((a, e) => a + (EXPENSE_CATS[e.category].ba ? e.vat : 0), 0);
    const paid = num(cm?.paid);
    const offen = num(cm?.offen);
    const ustOnProvi = kleinunternehmer ? 0 : paid * UST_RATE;
    const ustSetAside = Math.max(0, ustOnProvi - vorsteuer);
    const taxable = Math.max(0, paid - ba);
    const estSetAside = estReserve(taxable);
    const q = vatQuarter(new Date());
    const qEnd = new Date(q.to + "T12:00:00");
    qEnd.setDate(qEnd.getDate() + 1);
    const qEndIso = qEnd.toISOString().slice(0, 10);
    const [cmQ] = await db<{ paid: string }>`
      select coalesce(sum(amount) filter (where status = 'ausgezahlt'), 0)::text as paid
      from commissions
      where user_id = ${me.user_id}
        and calculated_at >= ${q.from}::date
        and calculated_at < ${qEndIso}::date
    `;
    const qPaid = num(cmQ?.paid);
    const qVor = kleinunternehmer
      ? 0
      : expenses
          .filter((e) => e.spent_on >= q.from && e.spent_on <= q.to && EXPENSE_CATS[e.category].ba)
          .reduce((a, e) => a + e.vat, 0);
    const va = kleinunternehmer ? ustVa(0, 0) : ustVa(qPaid, qVor);
    const name = `${me.first_name} ${me.last_name}`.trim();
    const steuernummer = set ? asStr(set.steuernummer) : "";
    return {
      year,
      kleinunternehmer,
      dauerfrist,
      steuerberater: set ? asStr(set.steuerberater) : "",
      steuernummer,
      notes: set ? asStr(set.notes) : "",
      paid,
      offen,
      cash,
      ba,
      vorsteuer,
      ustOnProvi,
      ustSetAside,
      taxable,
      estSetAside,
      estFree: EST_FREE,
      leftover: leftover({ proviPaid: paid, expensesCash: cash, ustSetAside, estSetAside }),
      reminders: reminders(new Date(), { kleinunternehmer, dauerfrist, year }),
      expenses,
      elster: {
        connected: false,
        url: ELSTER_URL,
        quarter: q.label,
        from: q.from,
        to: q.to,
        ...va,
        csv: elsterCsv({ name, steuernummer, quarter: q.label, kz81: va.kz81, kz66: va.kz66, kz83: va.kz83 }),
      },
    };
  });

export const saveSteuerSettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { kleinunternehmer: boolean; dauerfrist: boolean; steuerberater?: string; notes?: string; steuernummer?: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    await db`
      insert into tax_settings (user_id, kleinunternehmer, dauerfrist, steuerberater, steuernummer, notes, updated_at)
      values (
        ${me.user_id}, ${Boolean(data.kleinunternehmer)}, ${Boolean(data.dauerfrist)},
        ${data.steuerberater?.trim() || null}, ${data.steuernummer?.trim() || null}, ${data.notes?.trim() || null}, now()
      )
      on conflict (user_id) do update set
        kleinunternehmer = excluded.kleinunternehmer,
        dauerfrist = excluded.dauerfrist,
        steuerberater = excluded.steuerberater,
        steuernummer = excluded.steuernummer,
        notes = excluded.notes,
        updated_at = now()
    `;
    return { ok: true };
  });

export const addTaxExpense = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: {
    spentOn: string;
    category: string;
    amount: number;
    vatRate?: number;
    gross?: boolean;
    km?: number;
    note?: string;
  }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    if (!isExpenseCat(data.category)) throw new Error("Kategorie unbekannt.");
    const day = (data.spentOn || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Datum fehlt.");
    let amount = Number(data.amount);
    const km = data.category === "km" ? Number(data.km) || 0 : null;
    if (data.category === "km") amount = km! * 0.3;
    if (!(amount > 0)) throw new Error("Betrag fehlt.");
    const id = nid();
    await db`
      insert into tax_expenses (id, user_id, spent_on, category, amount, vat_rate, gross, km, note)
      values (
        ${id}, ${me.user_id}, ${day}, ${data.category}, ${amount},
        ${Number(data.vatRate) || 0}, ${data.gross !== false}, ${km}, ${data.note?.trim() || null}
      )
    `;
    return { id };
  });

export const deleteTaxExpense = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    await db`delete from tax_expenses where id = ${data.id} and user_id = ${me.user_id}`;
    return { ok: true };
  });
