import { createHash } from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";
import { nid } from "@/lib/utils";
import { sql } from "./helpers";

const WINDOW_MIN = 15;
const LOCK_MIN = 20;
const MAX_ID = 5;
const MAX_IP = 15;

export function sha256(v: string) {
  return createHash("sha256").update(v, "utf8").digest("hex");
}

export async function clientIp() {
  try {
    const req = getRequest();
    const xf = req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    return xf || req?.headers.get("cf-connecting-ip") || req?.headers.get("x-real-ip") || "unknown";
  } catch {
    return "unknown";
  }
}

function lockMsg() {
  return `Zu viele Fehlversuche. Bitte ${LOCK_MIN} Minuten warten.`;
}

async function load(kind: string, identifier: string) {
  const db = await sql();
  const [row] = await db<{
    fail_count: number;
    locked_until: string | Date | null;
    last_fail: string | Date;
  }>`
    select fail_count, locked_until, last_fail
    from auth_attempts
    where kind = ${kind} and identifier = ${identifier}
  `;
  return row;
}

function stillLocked(until: string | Date | null) {
  if (!until) return false;
  return new Date(until).getTime() > Date.now();
}

function inWindow(last: string | Date) {
  return Date.now() - new Date(last).getTime() < WINDOW_MIN * 60_000;
}

export async function assertAuthAllowed(kind: string, identifier: string) {
  const ip = await clientIp();
  const idRow = await load(kind, identifier);
  if (idRow && stillLocked(idRow.locked_until)) throw new Error(lockMsg());
  const ipRow = await load(`${kind}-ip`, ip);
  if (ipRow && stillLocked(ipRow.locked_until)) throw new Error(lockMsg());
  return ip;
}

export async function recordAuthFail(kind: string, identifier: string) {
  const ip = await clientIp();
  await bump(kind, identifier, MAX_ID, ip);
  await bump(`${kind}-ip`, ip, MAX_IP, ip);
  await new Promise((r) => setTimeout(r, 400));
}

export async function recordAuthOk(kind: string, identifier: string) {
  const ip = await clientIp();
  const db = await sql();
  await db`delete from auth_attempts where kind = ${kind} and identifier = ${identifier}`;
  await db`delete from auth_attempts where kind = ${kind + "-ip"} and identifier = ${ip}`;
}

async function bump(kind: string, identifier: string, max: number, ip: string) {
  const db = await sql();
  const row = await load(kind, identifier);
  let fails = 1;
  if (row && inWindow(row.last_fail)) fails = row.fail_count + 1;
  const locked = fails >= max;
  await db`
    insert into auth_attempts (id, kind, identifier, ip, fail_count, locked_until, last_fail)
    values (
      ${nid()}, ${kind}, ${identifier}, ${ip}, ${fails},
      ${locked ? new Date(Date.now() + LOCK_MIN * 60_000).toISOString() : null},
      now()
    )
    on conflict (kind, identifier) do update set
      fail_count = ${fails},
      ip = ${ip},
      locked_until = ${locked ? new Date(Date.now() + LOCK_MIN * 60_000).toISOString() : null},
      last_fail = now()
  `;
}

export async function auditAuth(action: string, ip: string, extra?: Record<string, string>) {
  const db = await sql();
  await db`
    insert into audit_log (id, user_id, action, entity_type, entity_id, new_values, ip)
    values (
      ${nid()}, null, ${action}, 'auth', ${extra?.id || "anon"},
      ${JSON.stringify({ ...extra, ip })}, ${ip}
    )
  `;
}
