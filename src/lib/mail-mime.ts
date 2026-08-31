/** Roh-MIME (multipart, QP, Base64) → lesbarer Text + HTML. */

export function decodeQuotedPrintable(input: string) {
  const soft = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < soft.length; i++) {
    if (soft[i] === "=" && /^[0-9A-Fa-f]{2}/.test(soft.slice(i + 1, i + 3))) {
      bytes.push(parseInt(soft.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(soft.charCodeAt(i) & 0xff);
  }
  return Buffer.from(bytes).toString("utf8");
}

export function decodeMimeWord(value: string) {
  return value.replace(/=\?([^?]+)\?([BQbq])\?([^?]*)\?=/g, (_m, _cs, enc, data) => {
    try {
      if (String(enc).toUpperCase() === "B") return Buffer.from(String(data).replace(/\s/g, ""), "base64").toString("utf8");
      return decodeQuotedPrintable(String(data).replace(/_/g, " "));
    } catch {
      return String(data);
    }
  });
}

function headerMap(raw: string) {
  const unfolded = raw.replace(/\r?\n[ \t]+/g, " ");
  const out: Record<string, string> = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return out;
}

function decodeBody(body: string, encoding: string) {
  const enc = encoding.toLowerCase();
  if (enc.includes("base64")) {
    try {
      return Buffer.from(body.replace(/\s/g, ""), "base64").toString("utf8");
    } catch {
      return body;
    }
  }
  if (enc.includes("quoted-printable")) return decodeQuotedPrintable(body);
  return body;
}

function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/"/g, '"')
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function sanitizeMailHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/javascript:/gi, "");
}

export type ParsedMail = { text: string; html: string; subject: string };

function parsePart(raw: string): ParsedMail {
  const split = raw.search(/\r?\n\r?\n/);
  const head = split >= 0 ? raw.slice(0, split) : raw;
  const body = split >= 0 ? raw.slice(split).replace(/^\r?\n\r?\n/, "") : "";
  const headers = headerMap(head);
  const ctype = (headers["content-type"] || "text/plain").toLowerCase();
  const enc = headers["content-transfer-encoding"] || "";
  const subject = decodeMimeWord(headers.subject || "");
  if (ctype.includes("multipart") && /boundary="?([^";\s]+)"?/i.test(headers["content-type"] || "")) {
    const boundary = RegExp.$1;
    const chunks = body.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    let text = "";
    let html = "";
    for (const chunk of chunks) {
      if (!chunk.trim() || chunk.startsWith("--")) continue;
      const part = parsePart(chunk.replace(/^\r?\n/, ""));
      if (part.html && !html) html = part.html;
      if (part.text && !text) text = part.text;
    }
    return { text: text || htmlToText(html), html, subject };
  }
  const decoded = decodeBody(body, enc);
  if (ctype.includes("text/html")) {
    return { text: htmlToText(decoded), html: decoded, subject };
  }
  if (ctype.includes("text/plain") || !ctype.includes("image") && !ctype.includes("application")) {
    return { text: decoded.trim(), html: "", subject };
  }
  return { text: "", html: "", subject };
}

export function looksLikeMime(raw: string) {
  const s = raw.trim();
  return (
    /^content-type:/im.test(s) ||
    /^mime-version:/im.test(s) ||
    /^--[A-Za-z0-9'()+_,-.=]+/.test(s) ||
    /Content-Transfer-Encoding:/i.test(s)
  );
}

export function parseMimeMessage(raw: string): ParsedMail {
  if (!raw.trim()) return { text: "", html: "", subject: "" };
  if (!looksLikeMime(raw) && !raw.includes("Content-Type")) {
    if (/<[a-z][\s\S]*>/i.test(raw)) return { text: htmlToText(raw), html: raw, subject: "" };
    return { text: raw.trim(), html: "", subject: "" };
  }
  return parsePart(raw);
}

export function readableMailBody(raw: string) {
  const parsed = parseMimeMessage(raw);
  return parsed.text || parsed.html || raw;
}
