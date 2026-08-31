import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { MAIL_DOMAIN, mailAddress } from "@/lib/mail";
import {
  MAIL_FOLDERS,
  forwardSubject,
  replySubject,
  type MailFolder,
} from "@/lib/mailbox";
import { asStr, num } from "@/lib/utils";
import { parseMimeMessage, sanitizeMailHtml } from "@/lib/mail-mime";
import { requireProfile, sql } from "./helpers";
import {
  assertCanRead,
  assertCanSend,
  authGate,
  boxesFor,
  ingestMessage,
  unreadCountFor,
} from "./mailbox.server";

function asFolder(v: unknown): MailFolder {
  const s = String(v ?? "inbox");
  return (MAIL_FOLDERS as readonly string[]).includes(s) ? (s as MailFolder) : "inbox";
}

export const listMailboxes = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const boxes = await boxesFor(db, me);
    const unread = await unreadCountFor(db, boxes);
    let counts: Array<{ mailbox: string; folder: string; n: number; unread: number }> = [];
    try {
      counts = await db<{ mailbox: string; folder: string; n: number; unread: number }>`
        select mailbox, folder, count(*)::int as n, coalesce(sum(unread_count),0)::int as unread
        from mailbox_threads
        where mailbox = any(${boxes.map((b) => b.local)})
        group by mailbox, folder
      `;
    } catch {
      counts = [];
    }
    return { boxes, unread, counts, domain: MAIL_DOMAIN };
  });

export const listThreads = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { mailbox?: string; folder?: MailFolder; q?: string; customerId?: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const boxes = await boxesFor(db, me);
    const locals = boxes.map((b) => b.local);
    const customerId = data.customerId?.trim() || null;
    const mailbox = data.mailbox?.replace(/@.*$/, "") || (customerId ? null : boxes[0]?.local);
    if (mailbox) assertCanRead(me, mailbox, boxes);
    if (!mailbox && !customerId) return { threads: [], mailbox: "", folder: asFolder(data.folder), can_send: false };
    const folder = asFolder(data.folder);
    const q = data.q?.trim().toLowerCase() ?? "";
    const rows = await db<Record<string, unknown>>`
      select t.*,
        (select count(*) from mailbox_attachments a
           join mailbox_messages m on m.id = a.message_id
          where m.thread_id = t.id) as attachments
      from mailbox_threads t
      where t.mailbox = any(${mailbox ? [mailbox] : locals})
        and t.folder = ${folder}
        and (${customerId}::text is null or t.customer_id = ${customerId})
        and (
          ${q} = '' or lower(t.subject) like ${"%" + q + "%"} or lower(t.snippet) like ${"%" + q + "%"}
        )
      order by t.last_at desc
      limit 200
    `;
    return {
      mailbox: mailbox ?? "",
      folder,
      can_send: mailbox ? (boxes.find((b) => b.local === mailbox)?.can_send ?? false) : false,
      threads: rows.map((r) => ({
        id: asStr(r.id),
        mailbox: asStr(r.mailbox),
        subject: asStr(r.subject),
        snippet: asStr(r.snippet),
        folder: asStr(r.folder),
        last_at: asStr(r.last_at),
        unread_count: num(r.unread_count),
        attachments: num(r.attachments),
        customer_id: r.customer_id ? asStr(r.customer_id) : null,
        contract_id: r.contract_id ? asStr(r.contract_id) : null,
        lead_id: r.lead_id ? asStr(r.lead_id) : null,
        application_id: r.application_id ? asStr(r.application_id) : null,
        match_reason: r.match_reason ? asStr(r.match_reason) : null,
      })),
    };
  });

export const getThread = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const boxes = await boxesFor(db, me);
    const [thread] = await db<Record<string, unknown>>`select * from mailbox_threads where id = ${id}`;
    if (!thread) throw new Error("Unterhaltung nicht gefunden.");
    assertCanRead(me, asStr(thread.mailbox), boxes);
    const messages = await db<Record<string, unknown>>`
      select * from mailbox_messages where thread_id = ${id} order by sent_at asc
    `;
    const ids = messages.map((m) => asStr(m.id));
    const atts = ids.length
      ? await db<Record<string, unknown>>`
          select id, message_id, filename, mime_type, size_bytes
          from mailbox_attachments where message_id = any(${ids})
        `
      : [];
    const byMsg = new Map<string, typeof atts>();
    for (const a of atts) {
      const mid = asStr(a.message_id);
      const list = byMsg.get(mid) ?? [];
      list.push(a);
      byMsg.set(mid, list);
    }
    let customer: { id: string; name: string } | null = null;
    if (thread.customer_id) {
      const [c] = await db<{ id: string; first_name: string; last_name: string }>`
        select id, first_name, last_name from customers where id = ${asStr(thread.customer_id)}
      `;
      if (c) customer = { id: c.id, name: `${c.first_name} ${c.last_name}` };
    }
    return {
      thread: {
        id: asStr(thread.id),
        mailbox: asStr(thread.mailbox),
        subject: asStr(thread.subject),
        folder: asStr(thread.folder),
        last_at: asStr(thread.last_at),
        unread_count: num(thread.unread_count),
        customer_id: thread.customer_id ? asStr(thread.customer_id) : null,
        contract_id: thread.contract_id ? asStr(thread.contract_id) : null,
        lead_id: thread.lead_id ? asStr(thread.lead_id) : null,
        application_id: thread.application_id ? asStr(thread.application_id) : null,
        match_reason: thread.match_reason ? asStr(thread.match_reason) : null,
        customer,
      },
      can_send: boxes.find((b) => b.local === asStr(thread.mailbox))?.can_send ?? false,
      messages: messages.map((m) => {
        const raw = asStr(m.body_text);
        const htmlStored = raw.startsWith("<!--e1html-->") ? raw.slice("<!--e1html-->".length) : "";
        const parsed = htmlStored ? { text: "", html: htmlStored, subject: "" } : parseMimeMessage(raw);
        return {
          id: asStr(m.id),
          direction: asStr(m.direction),
          from_address: asStr(m.from_address),
          from_name: asStr(m.from_name),
          to_addresses: asStr(m.to_addresses),
          cc_addresses: asStr(m.cc_addresses),
          subject: asStr(m.subject),
          body_text: parsed.text || raw,
          body_html: parsed.html ? sanitizeMailHtml(parsed.html) : "",
          sent_at: asStr(m.sent_at),
          unread: Boolean(m.unread),
          draft: Boolean(m.draft),
          status: asStr(m.status),
          attachments: (byMsg.get(asStr(m.id)) ?? []).map((a) => ({
            id: asStr(a.id),
            filename: asStr(a.filename),
            mime_type: asStr(a.mime_type),
            size_bytes: num(a.size_bytes),
          })),
        };
      }),
    };
  });

export const markThreadRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: string; unread?: boolean }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const boxes = await boxesFor(db, me);
    const [thread] = await db<Record<string, unknown>>`select * from mailbox_threads where id = ${data.id}`;
    if (!thread) throw new Error("Nicht gefunden.");
    assertCanRead(me, asStr(thread.mailbox), boxes);
    const unread = Boolean(data.unread);
    await db`update mailbox_messages set unread = ${unread} where thread_id = ${data.id}`;
    await db`update mailbox_threads set unread_count = ${unread ? 1 : 0} where id = ${data.id}`;
    try {
      const { gmailMarkRead } = await import("./gmail.server");
      const msgs = await db<{ gmail_id: string }>`
        select gmail_id from mailbox_messages where thread_id = ${data.id} and gmail_id is not null
      `;
      for (const m of msgs) await gmailMarkRead(asStr(thread.mailbox), m.gmail_id, unread);
    } catch {
      /* local is source of truth in preview */
    }
    return { ok: true };
  });

export const sendMail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: {
      mailbox: string;
      to: string;
      cc?: string;
      subject: string;
      body: string;
      threadId?: string;
      inReplyTo?: string;
      draft?: boolean;
      attachments?: Array<{ filename: string; mime_type: string; content_base64: string }>;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const boxes = await boxesFor(db, me);
    const mailbox = data.mailbox.replace(/@.*$/, "");
    assertCanSend(me, mailbox, boxes);
    if (!data.to.trim() && !data.draft) throw new Error("Empfänger fehlt.");
    const atts = (data.attachments ?? []).slice(0, 8).map((a) => ({
      filename: a.filename.replace(/[^\w.\- äöüÄÖÜß]+/g, "_").slice(0, 80),
      mime_type: a.mime_type || "application/octet-stream",
      content_base64: a.content_base64.replace(/^data:[^;]+;base64,/, "").slice(0, 2_000_000),
    }));
    const gate = await authGate(db);
    const isDraft = Boolean(data.draft);
    if (!isDraft && !gate.ready) throw new Error(gate.reason ?? "Versand gesperrt.");
    const from = mailAddress(mailbox);
    const display = boxes.find((b) => b.local === mailbox)?.label ?? mailbox;
    let gmailId: string | null = null;
    let gmailThread: string | null = null;
    if (!isDraft) {
      try {
        const { buildRawMime, gmailSendRaw } = await import("./gmail.server");
        const { workspaceAdminReady } = await import("./workspace.server");
        if (workspaceAdminReady()) {
          const raw = buildRawMime({
            from: `${display} <${from}>`,
            to: data.to,
            cc: data.cc,
            subject: data.subject,
            text: data.body,
            inReplyTo: data.inReplyTo,
            attachments: atts,
          });
          const sent = await gmailSendRaw(mailbox, raw);
          gmailId = sent.id ?? null;
          gmailThread = sent.threadId ?? null;
        }
      } catch (e) {
        const { enqueueWorkspaceJob } = await import("./workspace.server");
        await enqueueWorkspaceJob(db, {
          action: "send_mail",
          localPart: mailbox,
          displayName: display,
          profileUserId: me.user_id,
          payload: { from, to: data.to, subject: data.subject, text: data.body },
        });
        if (e instanceof Error && /token|verbunden|HTTP/i.test(e.message)) {
          /* queued */
        } else if (e instanceof Error && e.message.includes("Gmail")) {
          throw e;
        }
      }
    }
    const ingested = await ingestMessage(db, {
      mailbox,
      direction: "out",
      from_address: from,
      from_name: display,
      to_addresses: data.to,
      cc_addresses: data.cc,
      subject: data.subject,
      body_text: data.body,
      folder: isDraft ? "drafts" : "sent",
      draft: isDraft,
      created_by: me.user_id,
      status: isDraft ? "draft" : gmailId ? "sent" : "queued",
      gmail_id: gmailId,
      gmail_thread_id: gmailThread,
      thread_id: data.threadId ?? null,
      in_reply_to: data.inReplyTo ?? null,
      attachments: atts,
    });
    return ingested;
  });

export const replyMail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (d: {
      threadId: string;
      body: string;
      attachments?: Array<{ filename: string; mime_type: string; content_base64: string }>;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const db = await sql();
    const [thread] = await db<Record<string, unknown>>`select * from mailbox_threads where id = ${data.threadId}`;
    if (!thread) throw new Error("Unterhaltung nicht gefunden.");
    const [last] = await db<Record<string, unknown>>`
      select * from mailbox_messages where thread_id = ${data.threadId} order by sent_at desc limit 1
    `;
    const mailbox = asStr(thread.mailbox);
    const to =
      asStr(last?.direction) === "in" ? asStr(last?.from_address) : asStr(last?.to_addresses);
    return sendMail({
      data: {
        mailbox,
        to,
        subject: replySubject(asStr(thread.subject)),
        body: data.body,
        threadId: data.threadId,
        inReplyTo: last ? asStr(last.id) : undefined,
        attachments: data.attachments,
      },
    });
  });

export const forwardMail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { messageId: string; to: string; note?: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const [msg] = await db<Record<string, unknown>>`select * from mailbox_messages where id = ${data.messageId}`;
    if (!msg) throw new Error("Nachricht nicht gefunden.");
    const body = `${data.note?.trim() ? `${data.note.trim()}\n\n` : ""}---------- Weitergeleitete Nachricht ----------\nVon: ${asStr(msg.from_name)} <${asStr(msg.from_address)}>\nDatum: ${asStr(msg.sent_at)}\nBetreff: ${asStr(msg.subject)}\nAn: ${asStr(msg.to_addresses)}\n\n${asStr(msg.body_text)}`;
    return sendMail({
      data: {
        mailbox: asStr(msg.mailbox),
        to: data.to,
        subject: forwardSubject(asStr(msg.subject)),
        body,
      },
    });
  });

export const archiveThread = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const boxes = await boxesFor(db, me);
    const [thread] = await db<{ mailbox: string }>`select mailbox from mailbox_threads where id = ${id}`;
    if (!thread) throw new Error("Nicht gefunden.");
    assertCanRead(me, thread.mailbox, boxes);
    await db`update mailbox_threads set folder = 'archive', unread_count = 0 where id = ${id}`;
    return { ok: true };
  });

export const getMailAttachment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const boxes = await boxesFor(db, me);
    const [row] = await db<Record<string, unknown>>`
      select a.*, m.mailbox, m.gmail_id
      from mailbox_attachments a
      join mailbox_messages m on m.id = a.message_id
      where a.id = ${id}
    `;
    if (!row) throw new Error("Anhang nicht gefunden.");
    assertCanRead(me, asStr(row.mailbox), boxes);
    let content = row.content_base64 ? asStr(row.content_base64) : "";
    if (!content && row.gmail_attachment_id && row.gmail_id) {
      const { gmailGetAttachment } = await import("./gmail.server");
      content = await gmailGetAttachment(asStr(row.mailbox), asStr(row.gmail_id), asStr(row.gmail_attachment_id));
      await db`update mailbox_attachments set content_base64 = ${content} where id = ${id}`;
    }
    if (!content) throw new Error("Anhang hat keinen Inhalt.");
    return {
      filename: asStr(row.filename),
      mime_type: asStr(row.mime_type),
      content_base64: content,
    };
  });

export const syncMailbox = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { mailbox: string }) => d)
  .handler(async ({ context, data }) => {
    const db = await sql();
    const me = await requireProfile(db, context.userId);
    const boxes = await boxesFor(db, me);
    const mailbox = data.mailbox.replace(/@.*$/, "");
    assertCanRead(me, mailbox, boxes);
    const { gmailListRecent, folderFromLabels } = await import("./gmail.server");
    const result = await gmailListRecent(mailbox);
    if (!result.ok) {
      await db`
        insert into mailbox_sync (mailbox, last_sync_at, last_error)
        values (${mailbox}, now(), ${result.error})
        on conflict (mailbox) do update set last_sync_at = now(), last_error = excluded.last_error
      `;
      throw new Error(result.error || "Gmail-Sync fehlgeschlagen");
    }
    let synced = 0;
    for (const msg of result.messages) {
      const folder = folderFromLabels(msg.label_ids, false);
      const out = await ingestMessage(db, {
        mailbox,
        direction: msg.label_ids.includes("SENT") ? "out" : "in",
        from_address: msg.from_address,
        from_name: msg.from_name,
        to_addresses: msg.to_addresses,
        cc_addresses: msg.cc_addresses,
        subject: msg.subject,
        body_text: msg.body_text,
        folder,
        unread: msg.unread,
        gmail_id: msg.gmail_id,
        gmail_thread_id: msg.thread_id,
        sent_at: msg.sent_at,
        attachments: msg.attachments.map((a) => ({
          filename: a.filename,
          mime_type: a.mime_type,
          size_bytes: a.size_bytes,
          gmail_attachment_id: a.gmail_attachment_id,
        })),
      });
      if (out.created) synced += 1;
    }
    await db`
      insert into mailbox_sync (mailbox, last_sync_at, last_error)
      values (${mailbox}, now(), null)
      on conflict (mailbox) do update set last_sync_at = now(), last_error = null
    `;
    return { ok: true, synced, source: "gmail" as const };
  });
