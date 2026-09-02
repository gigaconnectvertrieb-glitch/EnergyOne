import { mapNewsalesStatus, newsalesBody, newsalesConfigured, type NewsalesOrder } from "@/lib/newsales";
import { asStr, nid } from "@/lib/utils";
import { sql } from "./helpers";

export { newsalesConfigured };

export async function submitNewsalesOrder(order: NewsalesOrder) {
  if (!newsalesConfigured()) return { ok: false as const, reason: "not_configured" };
  const url = (process.env.NEWSALES_API_URL || "").trim();
  const key = (process.env.NEWSALES_API_KEY || "").trim();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      accept: "application/json",
    },
    body: JSON.stringify(newsalesBody(order)),
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let json: { id?: string; reference?: string; status?: string } = {};
  try {
    json = JSON.parse(text) as { id?: string; reference?: string; status?: string };
  } catch {
    json = {};
  }
  if (!res.ok) {
    return { ok: false as const, reason: `http_${res.status}`, detail: text.slice(0, 400) };
  }
  return {
    ok: true as const,
    ref: json.id || json.reference || "",
    status: json.status || "uebermittelt",
  };
}

export async function applyNewsalesWebhook(payload: {
  portalId?: string;
  reference?: string;
  status?: string;
}) {
  const db = await sql();
  const status = mapNewsalesStatus(payload.status || "");
  if (!status) return { ok: false, reason: "unknown_status" };
  const portalId = (payload.portalId || "").trim();
  const ref = (payload.reference || "").trim();
  const rows = portalId
    ? await db<Record<string, unknown>>`select id, status, newsales_ref from contracts where id = ${portalId}`
    : ref
      ? await db<Record<string, unknown>>`select id, status, newsales_ref from contracts where newsales_ref = ${ref} limit 1`
      : [];
  const row = rows[0];
  if (!row) return { ok: false, reason: "not_found" };
  const id = asStr(row.id);
  const old = asStr(row.status);
  await db`
    update contracts
    set status = ${status},
        newsales_ref = coalesce(nullif(${ref}, ''), newsales_ref),
        source = 'newsales_api',
        updated_at = now()
    where id = ${id}
  `;
  await db`
    insert into status_history (id, contract_id, old_status, new_status, changed_by, comment)
    values (${nid()}, ${id}, ${old}, ${status}, ${"system"}, ${"New Sales API"})
  `;
  return { ok: true, id, status };
}

export async function pushSavedContract(contractId: string) {
  if (!newsalesConfigured()) return { ok: false as const, reason: "not_configured" as const };
  const db = await sql();
  const [row] = await db<Record<string, unknown>>`
    select
      c.id, c.consumption_kwh, c.meter_number, c.previous_provider, c.start_date,
      c.bank_iban, c.bank_owner, c.notes, c.user_id, c.type, c.newsales_ref,
      t.name as tariff_name, t.provider,
      cu.first_name, cu.last_name, cu.phone, cu.email, cu.street, cu.house_number, cu.zip, cu.city, cu.birth_date,
      p.first_name as advisor_first, p.last_name as advisor_last
    from contracts c
    join customers cu on cu.id = c.customer_id
    left join tariffs t on t.id = c.tariff_id
    left join profiles p on p.user_id = c.user_id
    where c.id = ${contractId}
  `;
  if (!row) return { ok: false as const, reason: "missing" as const };
  if (asStr(row.newsales_ref)) return { ok: true as const, ref: asStr(row.newsales_ref), already: true };
  const pushed = await submitNewsalesOrder({
    portalId: asStr(row.id),
    advisorId: asStr(row.user_id),
    advisorName: `${asStr(row.advisor_first)} ${asStr(row.advisor_last)}`.trim(),
    customer: {
      firstName: asStr(row.first_name),
      lastName: asStr(row.last_name),
      phone: asStr(row.phone),
      email: asStr(row.email) || undefined,
      street: asStr(row.street),
      houseNumber: asStr(row.house_number),
      zip: asStr(row.zip),
      city: asStr(row.city),
      birthDate: row.birth_date ? String(row.birth_date).slice(0, 10) : undefined,
    },
    productName: asStr(row.tariff_name) || "Strom",
    provider: asStr(row.provider) || "Partner",
    type: asStr(row.type) || "strom",
    consumptionKwh: Number(row.consumption_kwh) || 0,
    meterNumber: asStr(row.meter_number) || undefined,
    previousProvider: asStr(row.previous_provider) || undefined,
    startDate: row.start_date ? String(row.start_date).slice(0, 10) : undefined,
    notes: asStr(row.notes) || undefined,
    iban: asStr(row.bank_iban) || undefined,
    bankOwner: asStr(row.bank_owner) || undefined,
  });
  if (pushed.ok) {
    await db`
      update contracts
      set newsales_ref = coalesce(nullif(${pushed.ref}, ''), newsales_ref),
          source = 'newsales_api',
          updated_at = now()
      where id = ${contractId}
    `;
  }
  return pushed;
}
