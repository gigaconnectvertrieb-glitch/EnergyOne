import { MAIL_DOMAIN, mailAddress } from "@/lib/mail";
import { googleAccessToken, workspaceAdminReady } from "./workspace.server";

export type GmailAttachmentIn = {
  filename: string;
  mime_type: string;
  content_base64: string;
};

export type ParsedGmailMessage = {
  gmail_id: string;
  thread_id: string;
  history_id: string | null;
  from_address: string;
  from_name: string;
  to_addresses: string;
  cc_addresses: string;
  subject: string;
  body_text: string;
  snippet: string;
  unread: boolean;
  sent_at: string;
  label_ids: string[];
  attachments: Array<{
    filename: string;
    mime_type: string;
    size_bytes: number;
    gmail_attachment_id: string;
    content_base64?: string;
  }>;
};

type GmailPart = {
  filename?: string;
  mimeType?: string;
  body?: { data?: string; size?: number; attachmentId?: string };
  headers?: Array<{ name: string; value: string }>;
  parts?: GmailPart[];
};

function header(headers: Array<{ name: string; value: string }> | undefined, name: string) {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function decodeB64Url(data: string) {
  const pad = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(pad, "base64").toString("utf8");
}

function parseFrom(raw: string): { name: string; address: string } {
  const m = raw.match(/^(.*)<([^>]+)>$/);
  if (m) return { name: m[1]!.replace(/["']/g, "").trim(), address: m[2]!.trim().toLowerCase() };
  if (raw.includes("@")) return { name: "", address: raw.trim().toLowerCase() };
  return { name: raw.trim(), address: "" };
}

function walkParts(part: GmailPart | undefined, acc: { text: string; html: string; attachments: ParsedGmailMessage["attachments"] }) {
  if (!part) return;
  const mime = (part.mimeType ?? "").toLowerCase();
  const filename = part.filename ?? "";
  if (filename && part.body?.attachmentId) {
    acc.attachments.push({
      filename,
      mime_type: part.mimeType || "application/octet-stream",
      size_bytes: part.body.size ?? 0,
      gmail_attachment_id: part.body.attachmentId,
    });
  } else if (mime === "text/plain" && part.body?.data) {
    acc.text += decodeB64Url(part.body.data);
  } else if (mime === "text/html" && part.body?.data && !acc.html) {
    acc.html = decodeB64Url(part.body.data);
  }
  for (const child of part.parts ?? []) walkParts(child, acc);
}

function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&/g, "&")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function gmailApi(
  mailbox: string,
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
  const address = mailbox.includes("@") ? mailbox : mailAddress(mailbox, MAIL_DOMAIN);
  const token = await googleAccessToken(address);
  if (!token) return { ok: false, status: 0, json: null, text: "Kein Workspace-Token" };
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 200) };
    }
  }
  return { ok: res.ok, status: res.status, json, text };
}

export function parseGmailMessage(raw: Record<string, unknown>): ParsedGmailMessage {
  const payload = (raw.payload ?? {}) as GmailPart;
  const headers = payload.headers ?? [];
  const from = parseFrom(header(headers, "From"));
  const acc = { text: "", html: "", attachments: [] as ParsedGmailMessage["attachments"] };
  walkParts(payload, acc);
  const body = acc.text.trim() || htmlToText(acc.html);
  const labelIds = Array.isArray(raw.labelIds) ? (raw.labelIds as string[]) : [];
  const internal = Number(raw.internalDate ?? Date.now());
  return {
    gmail_id: String(raw.id ?? ""),
    thread_id: String(raw.threadId ?? raw.id ?? ""),
    history_id: raw.historyId ? String(raw.historyId) : null,
    from_address: from.address,
    from_name: from.name,
    to_addresses: header(headers, "To"),
    cc_addresses: header(headers, "Cc"),
    subject: header(headers, "Subject"),
    body_text: body,
    snippet: String(raw.snippet ?? body.slice(0, 140)),
    unread: labelIds.includes("UNREAD"),
    sent_at: new Date(internal).toISOString(),
    label_ids: labelIds,
    attachments: acc.attachments,
  };
}

export function buildRawMime(input: {
  from: string;
  to: string;
  cc?: string;
  subject: string;
  text: string;
  inReplyTo?: string;
  attachments?: GmailAttachmentIn[];
}) {
  const atts = input.attachments ?? [];
  const subjectB64 = `=?UTF-8?B?${Buffer.from(input.subject).toString("base64")}?=`;
  const headers = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    input.cc ? `Cc: ${input.cc}` : null,
    `Subject: ${subjectB64}`,
    input.inReplyTo ? `In-Reply-To: ${input.inReplyTo}` : null,
    "MIME-Version: 1.0",
  ].filter(Boolean) as string[];

  if (!atts.length) {
    const raw = [...headers, "Content-Type: text/plain; charset=UTF-8", "", input.text].join("\r\n");
    return Buffer.from(raw).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  const boundary = `e1_${crypto.randomUUID().replace(/-/g, "")}`;
  const parts = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    input.text,
  ];
  for (const a of atts) {
    const b64 = a.content_base64.replace(/^data:[^;]+;base64,/, "");
    parts.push(
      `--${boundary}`,
      `Content-Type: ${a.mime_type}; name="${a.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${a.filename}"`,
      "",
      b64,
    );
  }
  parts.push(`--${boundary}--`, "");
  return Buffer.from(parts.join("\r\n")).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function gmailListRecent(mailbox: string, max = 40) {
  if (!workspaceAdminReady()) return { ok: false as const, error: "Kein Workspace-Token", messages: [] as ParsedGmailMessage[] };
  const list = await gmailApi(mailbox, `/messages?maxResults=${max}&labelIds=INBOX`);
  if (!list.ok) return { ok: false as const, error: list.text.slice(0, 200), messages: [] as ParsedGmailMessage[] };
  const ids = ((list.json as { messages?: Array<{ id: string }> })?.messages ?? []).map((m) => m.id);
  const messages: ParsedGmailMessage[] = [];
  for (const id of ids) {
    const got = await gmailApi(mailbox, `/messages/${id}?format=full`);
    if (!got.ok || !got.json || typeof got.json !== "object") continue;
    messages.push(parseGmailMessage(got.json as Record<string, unknown>));
  }
  return { ok: true as const, error: null as string | null, messages };
}

export async function gmailSendRaw(mailbox: string, raw: string) {
  const res = await gmailApi(mailbox, "/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw new Error(res.text.slice(0, 240) || `Gmail send ${res.status}`);
  return res.json as { id?: string; threadId?: string };
}

export async function gmailSaveDraft(mailbox: string, raw: string) {
  const res = await gmailApi(mailbox, "/drafts", {
    method: "POST",
    body: JSON.stringify({ message: { raw } }),
  });
  if (!res.ok) throw new Error(res.text.slice(0, 240) || `Gmail draft ${res.status}`);
  return res.json as { id?: string; message?: { id?: string; threadId?: string } };
}

export async function gmailMarkRead(mailbox: string, gmailId: string, unread: boolean) {
  await gmailApi(mailbox, `/messages/${gmailId}/modify`, {
    method: "POST",
    body: JSON.stringify(
      unread
        ? { addLabelIds: ["UNREAD"] }
        : { removeLabelIds: ["UNREAD"] },
    ),
  });
}

export async function gmailGetAttachment(mailbox: string, messageId: string, attachmentId: string) {
  const res = await gmailApi(mailbox, `/messages/${messageId}/attachments/${attachmentId}`);
  if (!res.ok) throw new Error("Anhang nicht geladen");
  const data = (res.json as { data?: string })?.data ?? "";
  return data.replace(/-/g, "+").replace(/_/g, "/");
}

export function folderFromLabels(labels: string[], draft: boolean): "inbox" | "sent" | "drafts" | "archive" {
  if (draft || labels.includes("DRAFT")) return "drafts";
  if (labels.includes("SENT") && !labels.includes("INBOX")) return "sent";
  if (labels.includes("INBOX")) return "inbox";
  return "archive";
}
