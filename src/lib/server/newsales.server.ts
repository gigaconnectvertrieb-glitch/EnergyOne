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
