import { connect } from "node:tls";
import type { ParsedGmailMessage } from "./gmail.server";
import { gmailAppPasswordReady, gmailSmtpUser } from "./smtp-gmail.server";
import { decodeMimeWord, parseMimeMessage } from "@/lib/mail-mime";

function env(key: string) {
  return (process.env[key] ?? "").trim();
}

function parseHeaderBlock(raw: string) {
  const head = raw.split(/\r?\n\r?\n/, 1)[0] || "";
  const unfolded = head.replace(/\r?\n[ \t]+/g, " ");
  const get = (name: string) => {
    const m = unfolded.match(new RegExp(`^${name}:\\s*(.*)$`, "im"));
    return (m?.[1] || "").trim();
  };
  const fromRaw = get("from");
  const m = fromRaw.match(/^(.*)<([^>]+)>$/);
  return {
    from_name: m ? m[1]!.replace(/["']/g, "").trim() : "",
    from_address: (m ? m[2]! : fromRaw).trim().toLowerCase(),
    to: get("to"),
    cc: get("cc"),
    subject: decodeMimeWord(get("subject")),
    date: get("date"),
  };
}

function parseImapFetch(blob: string): ParsedGmailMessage[] {
  const out: ParsedGmailMessage[] = [];
  const re = /\* \d+ FETCH \([\s\S]*?BODY\[\] \{(\d+)\}\r\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blob))) {
    const size = Number(m[1]);
    const start = m.index + m[0].length;
    const raw = blob.slice(start, start + size);
    const flagsChunk = blob.slice(Math.max(0, m.index - 0), start);
    const uid = /UID (\d+)/.exec(flagsChunk)?.[1] || String(start);
    const flags = /FLAGS \(([^)]*)\)/.exec(flagsChunk)?.[1] || "";
    const internal = /INTERNALDATE "([^"]+)"/.exec(flagsChunk)?.[1];
    const h = parseHeaderBlock(raw);
    const parsed = parseMimeMessage(raw);
    const body = parsed.text || parsed.html.replace(/<[^>]+>/g, " ").trim();
    const sent = internal ? new Date(internal) : h.date ? new Date(h.date) : new Date();
    out.push({
      gmail_id: `imap-${uid}`,
      thread_id: `imap-${uid}`,
      history_id: null,
      from_address: h.from_address,
      from_name: decodeMimeWord(h.from_name),
      to_addresses: h.to,
      cc_addresses: h.cc,
      subject: decodeMimeWord(h.subject) || parsed.subject,
      body_text: (parsed.html ? `<!--e1html-->${parsed.html}` : body).slice(0, 80000),
      snippet: body.slice(0, 140),
      unread: !/\\Seen/i.test(flags),
      sent_at: Number.isNaN(sent.getTime()) ? new Date().toISOString() : sent.toISOString(),
      label_ids: ["INBOX"],
      attachments: [],
    });
  }
  return out;
}

export async function imapListRecent(max = 40): Promise<{
  ok: boolean;
  error: string | null;
  messages: ParsedGmailMessage[];
  mailbox: string;
}> {
  const user = gmailSmtpUser();
  const pass = env("GMAIL_APP_PASSWORD").replace(/\s+/g, "");
  if (!gmailAppPasswordReady()) {
    return { ok: false, error: "Kein GMAIL_APP_PASSWORD", messages: [], mailbox: user };
  }

  const blob = await new Promise<string>((resolve, reject) => {
    const socket = connect({ host: "imap.gmail.com", port: 993, servername: "imap.gmail.com" }, () => {
      /* wait greeting */
    });
    let buf = "";
    let tag = 0;
    const next = (cmd: string) => {
      tag += 1;
      socket.write(`A${tag} ${cmd}\r\n`);
      return `A${tag}`;
    };
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("IMAP Timeout"));
    }, 25000);
    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      if (buf.includes("* OK") && tag === 0) {
        next(`LOGIN "${user}" "${pass}"`);
      }
      if (buf.includes(`A${tag} NO`) || buf.includes(`A${tag} BAD`)) {
        clearTimeout(timer);
        socket.end();
        reject(new Error(buf.slice(-180)));
        return;
      }
      if (tag === 1 && buf.includes("A1 OK")) next("SELECT INBOX");
      if (tag === 2 && buf.includes("A2 OK")) next("SEARCH ALL");
      if (tag === 3 && buf.includes("A3 OK")) {
        const search = /\* SEARCH ([0-9 ]+)/.exec(buf)?.[1] || "";
        const ids = search.trim().split(/\s+/).filter(Boolean);
        if (!ids.length) {
          clearTimeout(timer);
          socket.write("A99 LOGOUT\r\n");
          socket.end();
          resolve("");
          return;
        }
        const slice = ids.slice(-max);
        next(`FETCH ${slice[0]}:${slice[slice.length - 1]} (UID FLAGS INTERNALDATE BODY.PEEK[])`);
      }
      if (tag === 4 && buf.includes("A4 OK")) {
        clearTimeout(timer);
        socket.write("A99 LOGOUT\r\n");
        socket.end();
        resolve(buf);
      }
    });
  });

  return { ok: true, error: null, messages: parseImapFetch(blob), mailbox: user };
}

export async function imapDeleteUids(uids: string[]) {
  const user = gmailSmtpUser();
  const pass = env("GMAIL_APP_PASSWORD").replace(/\s+/g, "");
  const clean = uids.map((u) => u.replace(/^imap-/, "")).filter((u) => /^\d+$/.test(u));
  if (!gmailAppPasswordReady() || !clean.length) return;
  await new Promise<void>((resolve, reject) => {
    const socket = connect({ host: "imap.gmail.com", port: 993, servername: "imap.gmail.com" }, () => undefined);
    let buf = "";
    let tag = 0;
    const next = (cmd: string) => {
      tag += 1;
      socket.write(`A${tag} ${cmd}\r\n`);
    };
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("IMAP Timeout"));
    }, 15000);
    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      if (buf.includes("* OK") && tag === 0) next(`LOGIN "${user}" "${pass}"`);
      if (buf.includes(`A${tag} NO`) || buf.includes(`A${tag} BAD`)) {
        clearTimeout(timer);
        socket.end();
        reject(new Error(buf.slice(-120)));
        return;
      }
      if (tag === 1 && buf.includes("A1 OK")) next("SELECT INBOX");
      if (tag === 2 && buf.includes("A2 OK")) next(`UID STORE ${clean.join(",")} +FLAGS (\\Deleted)`);
      if (tag === 3 && buf.includes("A3 OK")) next("EXPUNGE");
      if (tag === 4 && buf.includes("A4 OK")) {
        clearTimeout(timer);
        socket.write("A99 LOGOUT\r\n");
        socket.end();
        resolve();
      }
    });
  });
}
