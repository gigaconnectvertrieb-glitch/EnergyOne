/** Unterschrift: vor Ort (Tablet) oder per E-Mail (DocuSign). */

export const SIGN_CHANNELS = ["tablet", "email"] as const;
export type SignChannel = (typeof SIGN_CHANNELS)[number];

export const SIGN_STATUSES = [
  "queued",
  "sent",
  "delivered",
  "completed",
  "declined",
  "voided",
  "failed",
] as const;
export type SignStatus = (typeof SIGN_STATUSES)[number];

export const SIGN_STATUS_LABELS: Record<SignStatus, string> = {
  queued: "Wartet auf DocuSign-Keys",
  sent: "An Kunden gesendet",
  delivered: "E-Mail zugestellt",
  completed: "Unterschrieben",
  declined: "Abgelehnt",
  voided: "Ungültig",
  failed: "Fehler",
};

export const DOCUSIGN_ENV = [
  "DOCUSIGN_INTEGRATION_KEY",
  "DOCUSIGN_USER_ID",
  "DOCUSIGN_ACCOUNT_ID",
  "DOCUSIGN_PRIVATE_KEY",
] as const;

export const DOCUSIGN_OPTIONAL_ENV = [
  "DOCUSIGN_OAUTH_BASE",
  "DOCUSIGN_CONNECT_SECRET",
] as const;

export function signEventToStatus(event: string): SignStatus | null {
  const e = event.toLowerCase();
  if (e.includes("completed")) return "completed";
  if (e.includes("declined")) return "declined";
  if (e.includes("voided")) return "voided";
  if (e.includes("delivered")) return "delivered";
  if (e.includes("sent")) return "sent";
  return null;
}

export function shouldImportSignedPdf(status: SignStatus) {
  return status === "completed";
}

export function pdfEscape(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Helvetica/WinAnsi: Umlaute als Oktal. */
export function toPdfText(s: string) {
  return pdfEscape(s)
    .replace(/Ä/g, "\\304")
    .replace(/Ö/g, "\\326")
    .replace(/Ü/g, "\\334")
    .replace(/ä/g, "\\344")
    .replace(/ö/g, "\\366")
    .replace(/ü/g, "\\374")
    .replace(/ß/g, "\\337")
    .replace(/€/g, "EUR")
    .replace(/—/g, "-")
    .replace(/–/g, "-");
}

export function wrapPdfLine(line: string, width = 88): string[] {
  if (!line) return [""];
  const words = line.split(/\s+/);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > width && cur) {
      out.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

function isHeading(line: string) {
  const t = line.trim();
  if (!t) return false;
  if (/^§\s*\d+/.test(t)) return true;
  if (/^ANLAGE\s+\d/i.test(t)) return true;
  if (/^(HANDELSVERTRETERVERTRAG|STROMLIEFERVERTRAG|GASLIEFERVERTRAG|MUSTEREMPFÄNGER|E1 DIREKTVERTRIEB)/.test(t)) {
    return true;
  }
  return t === t.toUpperCase() && t.length > 12 && t.length < 72 && /[A-ZÄÖÜ]/.test(t);
}

/** Professionelles Vertragslayout: Kopfzeile, Goldstreifen, Überschriften fett, Seitenzahl. */
export function buildPagedPdf(lines: string[], title = "Vertragsdokument") {
  const wrapped: { text: string; heading: boolean }[] = [];
  const pages: (typeof wrapped)[] = [];
  const perPage = 40;
  const flush = () => {
    if (wrapped.length) {
      pages.push(wrapped.splice(0, wrapped.length));
    }
  };
  for (const line of lines) {
    if (line.trim() === "---PAGE---") {
      flush();
      continue;
    }
    const heading = isHeading(line);
    const parts = heading ? [line.trim()] : wrapPdfLine(line, heading ? 70 : 86);
    for (const p of parts) {
      if (wrapped.length >= perPage) flush();
      wrapped.push({ text: p, heading });
    }
  }
  flush();
  if (!pages.length) pages.push([{ text: "", heading: false }]);
  const total = pages.length;

  const fontReg = "3 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj";
  const fontBold = "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj";
  const pageObjs: string[] = [];
  const contentObjs: string[] = [];
  const kids: string[] = [];
  let obj = 5;
  pages.forEach((page, pi) => {
    const header = [
      "0.788 0.635 0.153 rg",
      "0 822 595 20 re f",
      "1 1 1 rg",
      "BT /F2 9 Tf 48 828 Td (E1 DIREKTVERTRIEB  -  " + toPdfText(title.slice(0, 48)) + ") Tj ET",
      "0 g",
      "0.788 0.635 0.153 RG 0.6 w 48 812 499 0 m 547 812 l S",
    ];
    const footer = [
      "0.55 0.55 0.55 rg",
      `BT /F1 8 Tf 48 28 Td (${toPdfText("Vertraulich  |  Nur zur internen und vertraglichen Verwendung")}) Tj ET`,
      `BT /F1 8 Tf 480 28 Td (Seite ${pi + 1} / ${total}) Tj ET`,
      "0 g",
    ];
    const body = page.map((row, i) => {
      const y = 792 - i * 17;
      const font = row.heading ? "/F2 11" : "/F1 10";
      return `BT ${font} Tf 48 ${y} Td (${toPdfText(row.text)}) Tj ET`;
    });
    const stream = [...header, ...body, ...footer].join("\n") + "\n";
    const contentId = obj;
    const pageId = obj + 1;
    contentObjs.push(
      `${contentId} 0 obj << /Length ${Buffer.byteLength(stream, "latin1")} >> stream\n${stream}endstream endobj`,
    );
    pageObjs.push(
      `${pageId} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >> endobj`,
    );
    kids.push(`${pageId} 0 R`);
    obj += 2;
  });
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    `2 0 obj << /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >> endobj`,
    fontReg,
    fontBold,
    ...contentObjs.flatMap((c, i) => [c, pageObjs[i]!]),
  ];
  let offset = "%PDF-1.4\n".length;
  const xref = [0];
  let out = "%PDF-1.4\n";
  for (const o of objects) {
    xref.push(offset);
    out += o + "\n";
    offset += Buffer.byteLength(o + "\n", "latin1");
  }
  const startxref = offset;
  out += `xref\n0 ${objects.length + 1}\n`;
  out += "0000000000 65535 f \n";
  for (let i = 1; i < xref.length; i++) out += `${String(xref[i]).padStart(10, "0")} 00000 n \n`;
  out += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

export function buildContractPdf(lines: string[]) {
  return buildPagedPdf([...lines, "", "Unterschrift (Anker):  /sign1/"], "Energievertrag");
}
