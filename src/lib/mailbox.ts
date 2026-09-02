import { MAIL_DOMAIN, mailAddress, workspaceLocalPart } from "./mail.ts";
import type { Role } from "./e1.ts";

export const MAIL_FOLDERS = ["inbox", "sent", "drafts", "archive"] as const;
export type MailFolder = (typeof MAIL_FOLDERS)[number];

export const MAIL_FOLDER_LABELS: Record<MailFolder, string> = {
  inbox: "Posteingang",
  sent: "Gesendet",
  drafts: "Entwürfe",
  archive: "Archiv",
};

export const SHARED_SEND_ROLES: Record<string, Role[]> = {
  info: ["super_admin", "backoffice", "gebietsleiter"],
  bewerbung: ["super_admin", "backoffice"],
  business: ["super_admin", "gebietsleiter"],
};

export const SHARED_READ_ROLES: Record<string, Role[]> = {
  info: ["super_admin", "backoffice", "gebietsleiter", "teamleiter"],
  bewerbung: ["super_admin", "backoffice", "gebietsleiter"],
  business: ["super_admin", "gebietsleiter", "teamleiter"],
};

export type MailMatch = {
  customer_id: string | null;
  contract_id: string | null;
  lead_id: string | null;
  application_id: string | null;
  reason: string | null;
};

export function extractEmails(value: string) {
  const found = value.toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g);
  return Array.from(new Set(found ?? []));
}

const SHARED_ORDER = ["info", "bewerbung", "business", "dmarc", "system"];

/** Zielpostfach aus Empfängern, wenn alles in einem business@-Postfach landet. */
export function mailboxLocalFromRecipients(...chunks: string[]) {
  const emails = extractEmails(chunks.join(" "));
  const locals = emails
    .filter((e) => e.endsWith("@e1direktvertrieb.de"))
    .map((e) => e.split("@")[0] || "")
    .filter(Boolean);
  for (const key of SHARED_ORDER) {
    if (locals.includes(key)) return key;
  }
  return locals[0] || "business";
}

export function parseAddressList(value: string) {
  return value
    .split(/[,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function replySubject(subject: string) {
  const s = subject.trim() || "(kein Betreff)";
  return /^re\s*:/i.test(s) ? s : `Re: ${s}`;
}

export function forwardSubject(subject: string) {
  const s = subject.trim() || "(kein Betreff)";
  return /^(wg|fw|fwd)\s*:/i.test(s) ? s : `WG: ${s}`;
}

export function canReadSharedMailbox(role: Role, localPart: string) {
  return (SHARED_READ_ROLES[localPart] ?? []).includes(role);
}

export function canSendSharedMailbox(role: Role, localPart: string) {
  return (SHARED_SEND_ROLES[localPart] ?? []).includes(role);
}

export function personalMailboxFor(first: string, last: string) {
  const local = workspaceLocalPart(first, last);
  return local ? mailAddress(local) : "";
}

export function accessibleSharedLocals(role: Role) {
  return Object.keys(SHARED_READ_ROLES).filter((local) => canReadSharedMailbox(role, local));
}

export type MatchIndex = {
  customers: Array<{
    id: string;
    email: string | null;
    first_name: string;
    last_name: string;
    zip: string | null;
    phone: string | null;
  }>;
  contracts: Array<{ id: string; customer_id: string }>;
  leads: Array<{ id: string; name: string; phone: string | null }>;
  applications: Array<{ id: string; email: string; first_name: string; last_name: string }>;
};

export function matchInbound(
  input: { from: string; to: string; subject: string; body: string },
  index: MatchIndex,
): MailMatch {
  const empty: MailMatch = {
    customer_id: null,
    contract_id: null,
    lead_id: null,
    application_id: null,
    reason: null,
  };
  const hay = `${input.from} ${input.to} ${input.subject} ${input.body}`.toLowerCase();
  const emails = extractEmails(`${input.from} ${input.to} ${input.body}`);

  for (const app of index.applications) {
    if (app.email && emails.includes(app.email.toLowerCase())) {
      return { ...empty, application_id: app.id, reason: "Bewerbung per Absender" };
    }
  }

  for (const c of index.customers) {
    if (c.email && emails.includes(c.email.toLowerCase())) {
      const contract = index.contracts.find((x) => x.customer_id === c.id);
      return {
        ...empty,
        customer_id: c.id,
        contract_id: contract?.id ?? null,
        reason: "Kunden-E-Mail",
      };
    }
  }

  for (const ctr of index.contracts) {
    if (hay.includes(ctr.id.toLowerCase())) {
      return {
        ...empty,
        customer_id: ctr.customer_id,
        contract_id: ctr.id,
        reason: "Auftragsnummer im Betreff",
      };
    }
  }

  for (const c of index.customers) {
    const last = c.last_name.trim().toLowerCase();
    const zip = (c.zip ?? "").trim();
    if (last.length > 2 && zip && hay.includes(last) && hay.includes(zip)) {
      const contract = index.contracts.find((x) => x.customer_id === c.id);
      return {
        ...empty,
        customer_id: c.id,
        contract_id: contract?.id ?? null,
        reason: "Name und PLZ",
      };
    }
  }

  for (const lead of index.leads) {
    const phone = (lead.phone ?? "").replace(/\s+/g, "");
    if (phone.length >= 6 && hay.replace(/\s+/g, "").includes(phone)) {
      return { ...empty, lead_id: lead.id, reason: "Lead-Telefon" };
    }
    const name = lead.name.trim().toLowerCase();
    if (name.length > 4 && hay.includes(name)) {
      return { ...empty, lead_id: lead.id, reason: "Lead-Name" };
    }
  }

  return empty;
}

export function snippetOf(body: string, max = 140) {
  const t = body.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function formatFromHeader(name: string, address: string) {
  const n = name.trim();
  if (!n) return address;
  return `${n} <${address}>`;
}

export function mailboxLabel(local: string) {
  const map: Record<string, string> = {
    info: "Info",
    bewerbung: "Bewerbung",
    business: "Business",
    system: "System",
  };
  return map[local] ?? local;
}

export function isSharedLocal(local: string) {
  return local === "info" || local === "bewerbung" || local === "business";
}

export function denyMailboxSend(local: string, role: Role, isOwn: boolean) {
  if (isOwn) return null;
  if (isSharedLocal(local) && canSendSharedMailbox(role, local)) return null;
  return `Kein Senderecht für ${mailAddress(local, MAIL_DOMAIN)}.`;
}
