import { MAIL_DOMAIN } from "@/lib/mail";
import { laterCommission, newsalesPackage, qualityVerdict, type HandoverInput } from "@/lib/ops";
import { asStr, nid, num } from "@/lib/utils";
import { sql } from "./helpers";

type Db = Awaited<ReturnType<typeof sql>>;

export async function setting(db: Db, key: string, fallback: string) {
  const [row] = await db<{ value: string }>`select value from settings where key = ${key}`;
  return row?.value ?? fallback;
}

export async function putFile(bytes: string, filename: string) {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const root = process.env.UPLOAD_DIR || "/workspace/data/uploads";
  await mkdir(root, { recursive: true });
  const id = nid();
  const safe = filename.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "datei";
  const path = join(root, `${id}-${safe}`);
  const raw = bytes.includes(",") ? bytes.slice(bytes.indexOf(",") + 1) : bytes;
  await writeFile(path, Buffer.from(raw, "base64"));
  return { id, path: `local:${id}-${safe}`, disk: path };
}

export async function createHandover(db: Db, contractId: string, actorId: string) {
  const [row] = await db<Record<string, unknown>>`
    select c.*, cu.first_name, cu.last_name, cu.email, cu.phone, cu.street, cu.house_number,
           cu.zip, cu.city, cu.birth_date, p.name as product_name, p.provider,
           pr.first_name as advisor_first, pr.last_name as advisor_last
    from contracts c
    join customers cu on cu.id = c.customer_id
    left join products p on p.id = c.product_id
    left join profiles pr on pr.user_id = c.user_id
    where c.id = ${contractId}
  `;
  if (!row) return null;
  const input: HandoverInput = {
    id: asStr(row.id),
    type: asStr(row.type),
    product_name: asStr(row.product_name),
    provider: asStr(row.provider),
    consumption_kwh: num(row.consumption_kwh),
    meter_number: asStr(row.meter_number),
    previous_provider: asStr(row.previous_provider),
    start_date: row.start_date ? asStr(row.start_date) : null,
    iban: asStr(row.bank_iban),
    bank_owner: asStr(row.bank_owner),
    sepa: Boolean(row.sepa_confirmed),
    privacy: Boolean(row.privacy_confirmed),
    signature: Boolean(row.signature_confirmed),
    notes: asStr(row.notes),
    advisor: `${asStr(row.advisor_first)} ${asStr(row.advisor_last)}`.trim(),
    customer: {
      first_name: asStr(row.first_name),
      last_name: asStr(row.last_name),
      email: asStr(row.email),
      phone: asStr(row.phone),
      street: asStr(row.street),
      house_number: asStr(row.house_number),
      zip: asStr(row.zip),
      city: asStr(row.city),
      birth_date: row.birth_date ? asStr(row.birth_date) : null,
    },
  };
  const body = newsalesPackage(input);
  const to = await setting(db, "newsales_handover_to", `business@${MAIL_DOMAIN}`);
  const hid = nid();
  await db`
    insert into handovers (id, contract_id, channel, recipient, package_text, status, created_by)
    values (${hid}, ${contractId}, 'paket_mail', ${to}, ${body}, 'gesendet', ${actorId})
  `;
  await db`
    insert into documents (id, contract_id, type, file_path, uploaded_by)
    values (${nid()}, ${contractId}, 'newsales_paket', ${`data:text/plain;base64,${Buffer.from(body).toString("base64")}`}, ${actorId})
  `;
  try {
    const { ingestMessage } = await import("./mailbox.server");
    await ingestMessage(db, {
      mailbox: "business",
      direction: "out",
      from_address: `system@${MAIL_DOMAIN}`,
      from_name: "E1 System",
      to_addresses: to,
      subject: `New-Sales-Übergabe ${contractId}`,
      body_text: body,
      folder: "sent",
      created_by: actorId,
      status: "queued",
    });
  } catch {
    /* mailbox optional */
  }
  try {
    const { queuePortalMail } = await import("./workspace.server");
    await queuePortalMail(db, {
      from: `system@${MAIL_DOMAIN}`,
      to,
      subject: `New-Sales-Übergabe ${contractId}`,
      text: body,
      purpose: "newsales",
    });
  } catch {
    /* queued */
  }
  return { id: hid, recipient: to, body };
}

export async function ensureLaterCommissions(db: Db, contractId: string, toStatus: string) {
  const [row] = await db<Record<string, unknown>>`
    select c.user_id, p.commission_folge, p.commission_bestand
    from contracts c
    left join products p on p.id = c.product_id
    where c.id = ${contractId}
  `;
  if (!row) return;
  const userId = asStr(row.user_id);
  if (toStatus === "beliefert") {
    const folge = laterCommission("folge", num(row.commission_folge));
    if (folge) {
      const [exists] = await db`select id from commissions where contract_id = ${contractId} and type = 'folge'`;
      if (!exists) {
        await db`
          insert into commissions (id, contract_id, user_id, amount, type, status, note)
          values (${nid()}, ${contractId}, ${userId}, ${folge.amount}, 'folge', 'offen', 'Folgeprovision bei Belieferung')
        `;
      }
    }
  }
  if (toStatus === "abgerechnet") {
    const bestand = laterCommission("bestand", num(row.commission_bestand));
    if (bestand) {
      const [exists] = await db`select id from commissions where contract_id = ${contractId} and type = 'bestand'`;
      if (!exists) {
        await db`
          insert into commissions (id, contract_id, user_id, amount, type, status, note)
          values (${nid()}, ${contractId}, ${userId}, ${bestand.amount}, 'bestand', 'offen', 'Bestandsprovision bei Abrechnung')
        `;
      }
    }
  }
}

export async function evaluateQuality(db: Db, userId: string) {
  const [stats] = await db<{ total: number; stornos: number; is_demo: boolean }>`
    select
      (select count(*)::int from contracts where user_id = ${userId}) as total,
      (select count(*)::int from contracts where user_id = ${userId} and status = 'storniert') as stornos,
      coalesce((select is_demo from profiles where user_id = ${userId}), false) as is_demo
  `;
  const total = num(stats?.total);
  const stornos = num(stats?.stornos);
  const warnAt = Number(await setting(db, "quality_warn_rate", "0.25"));
  const blockAt = Number(await setting(db, "quality_block_rate", "0.40"));
  const verdict = qualityVerdict(total, stornos, warnAt, blockAt);
  if (verdict === "ok") return { verdict, total, stornos };
  const rate = total ? Math.round((stornos / total) * 100) : 0;
  const kind = verdict === "block" ? "stornoquote_kritisch" : "stornoquote";
  const [open] = await db`select id from quality_alerts where user_id = ${userId} and kind = ${kind} and resolved = false`;
  if (!open) {
    await db`
      insert into quality_alerts (id, user_id, kind, message, severity)
      values (
        ${nid()}, ${userId}, ${kind},
        ${`Stornoquote ${rate} % (${stornos}/${total} Aufträge).`},
        ${verdict === "block" ? "danger" : "warn"}
      )
    `;
  }
  if (verdict === "block" && !stats?.is_demo) {
    await db`update profiles set status = 'blocked', notes = ${`Auto-Sperre: Stornoquote ${rate} %`} where user_id = ${userId} and status = 'active'`;
  }
  return { verdict, total, stornos, rate };
}
