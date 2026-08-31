import {
  MAIL_DOMAIN,
  denySendReason,
  mailAddress,
  mailReady,
  workspaceLocalPart,
  type AuthState,
} from "@/lib/mail";
import {
  accessibleSharedLocals,
  canReadSharedMailbox,
  canSendSharedMailbox,
  denyMailboxSend,
  isSharedLocal,
  matchInbound,
  snippetOf,
  type MailFolder,
  type MatchIndex,
} from "@/lib/mailbox";
import type { Profile } from "@/lib/e1";
import { asStr, nid } from "@/lib/utils";
import { sql } from "./helpers";

type Db = Awaited<ReturnType<typeof sql>>;

export type MailboxBox = {
  local: string;
  address: string;
  label: string;
  kind: "personal" | "shared";
  can_send: boolean;
};

export function personalLocal(me: Profile) {
  return workspaceLocalPart(me.first_name, me.last_name);
}

export async function boxesFor(db: Db, me: Profile): Promise<MailboxBox[]> {
  const personal = personalLocal(me);
  let extras: Array<{ local_part: string; can_send: boolean }> = [];
  try {
    extras = await db<{ local_part: string; can_send: boolean }>`
      select local_part, can_send from mailbox_acl
      where user_id = ${me.user_id} and can_read = true
    `;
  } catch {
    extras = [];
  }
  const shared = new Set(accessibleSharedLocals(me.role));
  for (const row of extras) shared.add(row.local_part);
  const boxes: MailboxBox[] = [];
  if (personal) {
    boxes.push({
      local: personal,
      address: mailAddress(personal),
      label: `${me.first_name} ${me.last_name}`.trim() || personal,
      kind: "personal",
      can_send: true,
    });
  }
  for (const local of ["info", "bewerbung", "business"]) {
    if (!shared.has(local)) continue;
    const extra = extras.find((e) => e.local_part === local);
    boxes.push({
      local,
      address: mailAddress(local),
      label: local,
      kind: "shared",
      can_send: extra?.can_send || canSendSharedMailbox(me.role, local),
    });
  }
  return boxes;
}

export function assertCanRead(me: Profile, local: string, boxes: MailboxBox[]) {
  if (boxes.some((b) => b.local === local)) return;
  throw new Error(`Kein Zugriff auf ${mailAddress(local, MAIL_DOMAIN)}.`);
}

export function assertCanSend(me: Profile, local: string, boxes: MailboxBox[]) {
  const box = boxes.find((b) => b.local === local);
  if (!box) throw new Error(`Kein Zugriff auf ${mailAddress(local, MAIL_DOMAIN)}.`);
  if (!box.can_send) {
    throw new Error(denyMailboxSend(local, me.role, !isSharedLocal(local)) ?? "Kein Senderecht.");
  }
}

export async function loadMatchIndex(db: Db): Promise<MatchIndex> {
  const [customers, contracts, leads, applications] = await Promise.all([
    db<{ id: string; email: string | null; first_name: string; last_name: string; zip: string | null; phone: string | null }>`
      select id, email, first_name, last_name, zip, phone from customers
    `,
    db<{ id: string; customer_id: string }>`select id, customer_id from contracts`,
    db<{ id: string; name: string; phone: string | null }>`select id, name, phone from leads`,
    db<{ id: string; email: string; first_name: string; last_name: string }>`
      select id, email, first_name, last_name from career_applications
    `,
  ]);
  return { customers, contracts, leads, applications };
}

export async function ingestMessage(
  db: Db,
  input: {
    mailbox: string;
    direction: "in" | "out";
    from_address: string;
    from_name?: string;
    to_addresses: string;
    cc_addresses?: string;
    subject: string;
    body_text: string;
    folder?: MailFolder;
    unread?: boolean;
    draft?: boolean;
    sent_at?: string;
    created_by?: string | null;
    status?: string;
    gmail_id?: string | null;
    gmail_thread_id?: string | null;
    thread_id?: string | null;
    in_reply_to?: string | null;
    attachments?: Array<{ filename: string; mime_type: string; size_bytes?: number; content_base64?: string; gmail_attachment_id?: string }>;
  },
) {
  const mailbox = input.mailbox.replace(/@.*$/, "");
  if (input.gmail_id) {
    const [dup] = await db<{ id: string; thread_id: string }>`
      select id, thread_id from mailbox_messages where mailbox = ${mailbox} and gmail_id = ${input.gmail_id}
    `;
    if (dup) return { message_id: dup.id, thread_id: dup.thread_id, created: false };
  }

  const index = await loadMatchIndex(db);
  const match = matchInbound(
    {
      from: input.from_address,
      to: input.to_addresses,
      subject: input.subject,
      body: input.body_text,
    },
    index,
  );
  const folder = input.folder ?? (input.draft ? "drafts" : input.direction === "out" ? "sent" : "inbox");
  const snippet = snippetOf(input.body_text);
  let threadId = input.thread_id ?? null;
  if (!threadId && input.gmail_thread_id) {
    const [existing] = await db<{ id: string }>`
      select id from mailbox_threads where mailbox = ${mailbox} and gmail_thread_id = ${input.gmail_thread_id}
    `;
    threadId = existing?.id ?? null;
  }
  if (!threadId && input.in_reply_to) {
    const [parent] = await db<{ thread_id: string }>`
      select thread_id from mailbox_messages where id = ${input.in_reply_to} or gmail_id = ${input.in_reply_to}
    `;
    threadId = parent?.thread_id ?? null;
  }
  const unread = Boolean(input.unread && !input.draft && input.direction === "in");
  if (!threadId) {
    threadId = nid();
    await db`
      insert into mailbox_threads (
        id, mailbox, gmail_thread_id, subject, snippet, folder, last_at, unread_count,
        customer_id, contract_id, lead_id, application_id, match_reason
      ) values (
        ${threadId}, ${mailbox}, ${input.gmail_thread_id ?? null}, ${input.subject || "(kein Betreff)"},
        ${snippet}, ${folder}, ${input.sent_at ?? new Date().toISOString()}, ${unread ? 1 : 0},
        ${match.customer_id}, ${match.contract_id}, ${match.lead_id}, ${match.application_id}, ${match.reason}
      )
    `;
  } else {
    await db`
      update mailbox_threads set
        snippet = ${snippet},
        last_at = ${input.sent_at ?? new Date().toISOString()},
        folder = case when ${folder} = 'drafts' then folder else ${folder} end,
        unread_count = unread_count + ${unread ? 1 : 0},
        customer_id = coalesce(customer_id, ${match.customer_id}),
        contract_id = coalesce(contract_id, ${match.contract_id}),
        lead_id = coalesce(lead_id, ${match.lead_id}),
        application_id = coalesce(application_id, ${match.application_id}),
        match_reason = coalesce(match_reason, ${match.reason})
      where id = ${threadId}
    `;
  }
  const messageId = nid();
  await db`
    insert into mailbox_messages (
      id, thread_id, mailbox, gmail_id, direction, from_address, from_name, to_addresses, cc_addresses,
      subject, body_text, snippet, folder, unread, draft, in_reply_to, sent_at, created_by, status
    ) values (
      ${messageId}, ${threadId}, ${mailbox}, ${input.gmail_id ?? null}, ${input.direction},
      ${input.from_address.toLowerCase()}, ${input.from_name ?? ""}, ${input.to_addresses},
      ${input.cc_addresses ?? ""}, ${input.subject}, ${input.body_text}, ${snippet}, ${folder},
      ${unread}, ${Boolean(input.draft)}, ${input.in_reply_to ?? null},
      ${input.sent_at ?? new Date().toISOString()}, ${input.created_by ?? null},
      ${input.status ?? (input.draft ? "draft" : input.direction === "out" ? "sent" : "received")}
    )
  `;
  for (const att of input.attachments ?? []) {
    await db`
      insert into mailbox_attachments (id, message_id, filename, mime_type, size_bytes, content_base64, gmail_attachment_id)
      values (
        ${nid()}, ${messageId}, ${att.filename}, ${att.mime_type},
        ${att.size_bytes ?? Math.ceil((att.content_base64?.length ?? 0) * 0.75)},
        ${att.content_base64 ?? null}, ${att.gmail_attachment_id ?? null}
      )
    `;
  }
  return { message_id: messageId, thread_id: threadId, created: true, match };
}

export async function unreadCountFor(db: Db, boxes: MailboxBox[]) {
  if (!boxes.length) return 0;
  const locals = boxes.map((b) => b.local);
  const [row] = await db<{ c: number }>`
    select coalesce(sum(unread_count),0)::int as c
    from mailbox_threads
    where mailbox = any(${locals}) and folder = 'inbox'
  `;
  return Number(row?.c ?? 0);
}

export async function authGate(db: Db) {
  const [domain] = await db<{ spf_status: string; dkim_status: string; dmarc_status: string }>`
    select spf_status, dkim_status, dmarc_status from mail_domains where domain = ${MAIL_DOMAIN} limit 1
  `;
  const spf = (domain?.spf_status ?? "fehlt") as AuthState;
  const dkim = (domain?.dkim_status ?? "fehlt") as AuthState;
  const dmarc = (domain?.dmarc_status ?? "fehlt") as AuthState;
  return {
    ready: mailReady(spf, dkim, dmarc),
    reason: denySendReason(spf, dkim, dmarc),
  };
}

export { asStr };
