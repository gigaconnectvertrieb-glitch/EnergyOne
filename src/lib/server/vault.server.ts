import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import type { Sql } from "@/lib/db";

function keyOf(password: string, salt: Buffer) {
  return scryptSync(password, salt, 32);
}

export async function lockContract(
  db: Sql,
  contractId: string,
  password: string,
  data: Record<string, string>,
) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyOf(password, salt), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([enc, tag]).toString("base64");
  await db`
    insert into contract_locks (contract_id, salt, iv, payload)
    values (${contractId}, ${salt.toString("hex")}, ${iv.toString("hex")}, ${payload})
    on conflict (contract_id) do update set salt = excluded.salt, iv = excluded.iv, payload = excluded.payload
  `;
}

export async function unlockContract(db: Sql, contractId: string, password: string) {
  const [row] = await db<{ salt: string; iv: string; payload: string }>`
    select salt, iv, payload from contract_locks where contract_id = ${contractId}
  `;
  if (!row) throw new Error("Keine gesperrten Daten.");
  try {
    const salt = Buffer.from(row.salt, "hex");
    const iv = Buffer.from(row.iv, "hex");
    const raw = Buffer.from(row.payload, "base64");
    const data = raw.subarray(0, raw.length - 16);
    const tag = raw.subarray(raw.length - 16);
    const dec = createDecipheriv("aes-256-gcm", keyOf(password, salt), iv);
    dec.setAuthTag(tag);
    const json = Buffer.concat([dec.update(data), dec.final()]).toString("utf8");
    return JSON.parse(json) as Record<string, string>;
  } catch {
    throw new Error("Passwort falsch.");
  }
}
