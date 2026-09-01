import webpush from "web-push";
import type { Sql } from "@/lib/db";
import { asStr, nid } from "@/lib/utils";

const SUBJECT = "mailto:business@e1direktvertrieb.de";

type Vapid = { publicKey: string; privateKey: string };

async function loadVapid(db: Sql): Promise<Vapid> {
  const envPub = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPriv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (envPub && envPriv) return { publicKey: envPub, privateKey: envPriv };
  const rows = await db<{ key: string; value: string }>`
    select key, value from settings where key in ('vapid_public', 'vapid_private')
  `;
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  if (map.vapid_public && map.vapid_private) {
    return { publicKey: map.vapid_public, privateKey: map.vapid_private };
  }
  const generated = webpush.generateVAPIDKeys();
  await db`
    insert into settings (key, value) values
      ('vapid_public', ${generated.publicKey}),
      ('vapid_private', ${generated.privateKey})
    on conflict (key) do nothing
  `;
  const again = await db<{ key: string; value: string }>`
    select key, value from settings where key in ('vapid_public', 'vapid_private')
  `;
  const stored = Object.fromEntries(again.map((r) => [r.key, r.value]));
  if (stored.vapid_public && stored.vapid_private) {
    return { publicKey: stored.vapid_public, privateKey: stored.vapid_private };
  }
  return generated;
}

export async function vapidPublicKey(db: Sql) {
  return (await loadVapid(db)).publicKey;
}

export async function saveSubscription(
  db: Sql,
  userId: string,
  sub: { endpoint?: string; keys?: { p256dh?: string; auth?: string } },
  userAgent?: string,
) {
  const endpoint = asStr(sub.endpoint);
  const p256dh = asStr(sub.keys?.p256dh);
  const auth = asStr(sub.keys?.auth);
  if (!endpoint || !p256dh || !auth) throw new Error("Ungültiges Push-Abo.");
  await db`
    insert into push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent)
    values (${nid()}, ${userId}, ${endpoint}, ${p256dh}, ${auth}, ${userAgent || null})
    on conflict (endpoint) do update set
      user_id = excluded.user_id,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      user_agent = excluded.user_agent
  `;
}

export async function dropSubscription(db: Sql, userId: string, endpoint?: string) {
  if (endpoint) {
    await db`delete from push_subscriptions where user_id = ${userId} and endpoint = ${endpoint}`;
  } else {
    await db`delete from push_subscriptions where user_id = ${userId}`;
  }
}

export async function hasSubscription(db: Sql, userId: string) {
  const [row] = await db<{ n: number }>`
    select count(*)::int as n from push_subscriptions where user_id = ${userId}
  `;
  return Number(row?.n) > 0;
}

export async function sendPushToUser(
  db: Sql,
  userId: string,
  payload: { title: string; body: string; url?: string },
) {
  const subs = await db<{ id: string; endpoint: string; p256dh: string; auth: string }>`
    select id, endpoint, p256dh, auth from push_subscriptions where user_id = ${userId}
  `;
  if (!subs.length) return 0;
  const vapid = await loadVapid(db);
  webpush.setVapidDetails(SUBJECT, vapid.publicKey, vapid.privateKey);
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/app",
  });
  let ok = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
        TTL: 60 * 60 * 12,
        urgency: "normal",
      });
      ok += 1;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await db`delete from push_subscriptions where id = ${s.id}`;
      }
    }
  }
  return ok;
}
