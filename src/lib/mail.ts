export const MAIL_DOMAIN = "e1direktvertrieb.de";

/** Only Google Workspace. Microsoft 365 is not used. */
export const MAIL_PROVIDER = "google_workspace" as const;
export type MailProvider = typeof MAIL_PROVIDER;
export const MAIL_PROVIDERS = [MAIL_PROVIDER] as const;

export const MAIL_PROVIDER_LABELS: Record<MailProvider, string> = {
  google_workspace: "Google Workspace",
};

export const DMARC_POLICIES = ["none", "quarantine", "reject"] as const;
export type DmarcPolicy = (typeof DMARC_POLICIES)[number];

export const DMARC_POLICY_LABELS: Record<DmarcPolicy, string> = {
  none: "none — nur beobachten",
  quarantine: "quarantine — verdächtig in Spam",
  reject: "reject — Fälschungen ablehnen",
};

export const AUTH_STATES = ["ok", "fehlt", "fehlerhaft"] as const;
export type AuthState = (typeof AUTH_STATES)[number];

export const AUTH_STATE_LABELS: Record<AuthState, string> = {
  ok: "ok",
  fehlt: "fehlt",
  fehlerhaft: "fehlerhaft",
};

export const AUTH_STATE_TONE: Record<AuthState, "success" | "warn" | "danger"> = {
  ok: "success",
  fehlt: "warn",
  fehlerhaft: "danger",
};

export type MailIdentityKind = "company" | "personal" | "system" | "reports";
export type MailboxType = "shared" | "user" | "system" | "reports";
export type WorkspaceAccountStatus =
  | "pending"
  | "queued"
  | "provisioned"
  | "suspended"
  | "shared"
  | "failed";

export const KIND_LABELS: Record<MailIdentityKind, string> = {
  company: "Firma",
  personal: "Mitarbeiter",
  system: "System",
  reports: "Reports",
};

export const MAILBOX_TYPE_LABELS: Record<MailboxType, string> = {
  shared: "Shared (Google Group)",
  user: "Persönlich (Directory-User)",
  system: "System (Gmail API über Render)",
  reports: "DMARC-Reports",
};

export const WORKSPACE_STATUS_LABELS: Record<WorkspaceAccountStatus, string> = {
  pending: "ausstehend",
  queued: "in der Warteschlange",
  provisioned: "in Workspace aktiv",
  suspended: "in Workspace gesperrt",
  shared: "Shared-Postfach",
  failed: "Provisionierung fehlgeschlagen",
};

export const REQUIRED_LOCAL_PARTS = ["info", "bewerbung", "business", "dmarc", "system"] as const;

/** Live Google Workspace mailboxes on e1direktvertrieb.de */
export const FOUNDER_LOCAL_PARTS = {
  orhan: "orhan.salo",
  luca: "luca.marrancone",
} as const;

export const FOUNDER_MAILS = [
  `${FOUNDER_LOCAL_PARTS.orhan}@${MAIL_DOMAIN}`,
  `${FOUNDER_LOCAL_PARTS.luca}@${MAIL_DOMAIN}`,
] as const;

export const SHARED_MAILBOXES = [
  {
    local_part: "info",
    display_name: "E1 Direktvertrieb",
    kind: "company" as const,
    mailbox_type: "shared" as const,
    purpose: "Allgemeine Anfragen und Website-Beratung",
  },
  {
    local_part: "bewerbung",
    display_name: "E1 Karriere",
    kind: "company" as const,
    mailbox_type: "shared" as const,
    purpose: "Bewerbungen und Onboarding",
  },
  {
    local_part: "business",
    display_name: "E1 Business",
    kind: "company" as const,
    mailbox_type: "shared" as const,
    purpose: "Partner, B2B, Kooperationen",
  },
] as const;

export const SYSTEM_MAILBOXES = [
  {
    local_part: "system",
    display_name: "E1 System",
    kind: "system" as const,
    mailbox_type: "system" as const,
    purpose: "Portal-Mails über die Gmail API. Render sendet im Auftrag, Workspace hält das Postfach.",
  },
  {
    local_part: "dmarc",
    display_name: "E1 DMARC Reports",
    kind: "reports" as const,
    mailbox_type: "reports" as const,
    purpose: "rua/ruf Aggregate- und Forensik-Reports",
  },
] as const;

export const FOUNDER_MAILBOXES = [
  {
    local_part: FOUNDER_LOCAL_PARTS.orhan,
    display_name: "Orhan Salo",
    kind: "personal" as const,
    mailbox_type: "user" as const,
    purpose: "Geschäftsführung",
  },
  {
    local_part: FOUNDER_LOCAL_PARTS.luca,
    display_name: "Luca Marco Marrancone",
    kind: "personal" as const,
    mailbox_type: "user" as const,
    purpose: "Geschäftsführung",
  },
] as const;

export const DEFAULT_IDENTITIES: Array<{
  local_part: string;
  display_name: string;
  kind: MailIdentityKind;
  mailbox_type: MailboxType;
  purpose: string;
}> = [...SHARED_MAILBOXES, ...SYSTEM_MAILBOXES, ...FOUNDER_MAILBOXES];

export const GOOGLE_MX = [
  { value: "aspmx.l.google.com", priority: 1 },
  { value: "alt1.aspmx.l.google.com", priority: 5 },
  { value: "alt2.aspmx.l.google.com", priority: 5 },
  { value: "alt3.aspmx.l.google.com", priority: 10 },
  { value: "alt4.aspmx.l.google.com", priority: 10 },
] as const;



export const GOOGLE_ADMIN_SCOPES = [
  "https://www.googleapis.com/auth/admin.directory.user",
  "https://www.googleapis.com/auth/admin.directory.group",
  "https://www.googleapis.com/auth/admin.directory.group.member",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.modify",
] as const;

export const SETUP_STEPS = [
  {
    title: "Google Workspace ist der Mailanbieter",
    body: "Domain e1direktvertrieb.de liegt in Google Workspace. Shared-Postfächer (info, bewerbung, business) und persönliche Postfächer kommen aus dem Directory — nicht aus Microsoft 365.",
  },
  {
    title: "SPF setzen",
    body: "TXT am Apex: v=spf1 include:_spf.google.com -all. Nur Google darf senden. ~all oder +all gelten als fehlerhaft.",
  },
  {
    title: "DKIM in der Admin-Konsole aktivieren",
    body: "Google Admin → Apps → Google Workspace → Gmail → Authentifizierung der E-Mails. Selektor google._domainkey 1:1 in den DNS der Domain übernehmen.",
  },
  {
    title: "DMARC starten",
    body: "TXT auf _dmarc mit p=none, Reports an dmarc@ und die Gründer-Postfächer. Nach 2–4 Wochen p=quarantine, später p=reject.",
  },
  {
    title: "Render spricht mit Workspace — kein Mailserver auf Render",
    body: "API-Keys nur in Render Environment Variables. Gmail API für Senden und Empfangen, Admin SDK für User anlegen und sperren. Mitarbeiter-Passwörter bleiben in Workspace, nicht in unserer Datenbank.",
  },
] as const;

export const DMARC_ROLLOUT = [
  { policy: "none" as DmarcPolicy, when: "Tag 1", note: "Nur beobachten. Zustellung unverändert, Reports sammeln." },
  { policy: "quarantine" as DmarcPolicy, when: "Nach 2–4 Wochen", note: "Verdächtige Fälschungen landen im Spam." },
  { policy: "reject" as DmarcPolicy, when: "Wenn Reports sauber sind", note: "Fremde Server dürfen nicht mehr im Namen von E1 schreiben." },
] as const;

export type DnsRecord = {
  type: "TXT" | "CNAME" | "MX";
  host: string;
  value: string;
  purpose: "spf" | "dkim" | "dmarc" | "mx";
  hint: string;
  priority?: number;
};

export function slugMailPart(value: string) {
  return value
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "ae")
    .replace(/Ö/g, "oe")
    .replace(/Ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/-/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function personalLocalPart(first: string, last: string) {
  const a = slugMailPart(first);
  const b = slugMailPart(last);
  if (!a || !b) return "";
  return `${a}.${b}`;
}

const FOUNDER_LOCAL_OVERRIDES: Record<string, string> = {
  "orhan salo": FOUNDER_LOCAL_PARTS.orhan,
  "luca-marco marrancone": FOUNDER_LOCAL_PARTS.luca,
  "luca marco marrancone": FOUNDER_LOCAL_PARTS.luca,
  "luca marrancone": FOUNDER_LOCAL_PARTS.luca,
  "lucamarco marrancone": FOUNDER_LOCAL_PARTS.luca,
};

/** Workspace local-part: vorname.nachname, except the live founder mailboxes. */
export function workspaceLocalPart(first: string, last: string) {
  const raw = `${first} ${last}`.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ").trim();
  if (FOUNDER_LOCAL_OVERRIDES[raw]) return FOUNDER_LOCAL_OVERRIDES[raw];
  const key = `${slugMailPart(first)} ${slugMailPart(last)}`.trim();
  if (FOUNDER_LOCAL_OVERRIDES[key]) return FOUNDER_LOCAL_OVERRIDES[key];
  return personalLocalPart(first, last);
}

export function normalizeLocalPart(value: string) {
  return value
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "ae")
    .replace(/Ö/g, "oe")
    .replace(/Ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
}

export function isValidLocalPart(part: string) {
  return /^[a-z0-9](?:[a-z0-9.-]{0,62}[a-z0-9])?$/.test(part) && !part.includes("..");
}

export function mailAddress(localPart: string, domain = MAIL_DOMAIN) {
  return `${localPart}@${domain}`;
}

export function isCompanySender(address: string, domain = MAIL_DOMAIN) {
  return address.trim().toLowerCase().endsWith(`@${domain}`);
}

export function dmarcRecord(policy: DmarcPolicy, reportTo: string) {
  const rua = `mailto:${reportTo}`;
  const ruf = FOUNDER_MAILS.map((m) => `mailto:${m}`).join(",");
  return `v=DMARC1; p=${policy}; sp=${policy}; rua=${rua}; ruf=${ruf}; fo=1; adkim=s; aspf=s; pct=100; ri=86400;`;
}

export function expectedSpf(_provider: MailProvider = MAIL_PROVIDER) {
  return "v=spf1 include:_spf.google.com -all";
}

export function dnsRecordsFor(
  _provider: MailProvider = MAIL_PROVIDER,
  domain = MAIL_DOMAIN,
  policy: DmarcPolicy = "none",
  reportTo = `dmarc@${domain}`,
): DnsRecord[] {
  const dmarc = dmarcRecord(policy, reportTo);
  return [
    {
      type: "TXT",
      host: "@",
      value: expectedSpf(),
      purpose: "spf",
      hint: "Nur Google Workspace darf senden. -all blockt alle anderen Server hart.",
    },
    {
      type: "TXT",
      host: "google._domainkey",
      value: "v=DKIM1; k=rsa; p=<GOOGLE_DKIM_PUBLIC_KEY>",
      purpose: "dkim",
      hint: "Schlüssel in Google Admin → Apps → Gmail → Authentifizierung der E-Mails erzeugen und p= hier ersetzen.",
    },
    {
      type: "TXT",
      host: "_dmarc",
      value: dmarc,
      purpose: "dmarc",
      hint: "Start mit p=none. Nach 2–4 Wochen Reports prüfen, dann quarantine, später reject.",
    },
    ...GOOGLE_MX.map((mx) => ({
      type: "MX" as const,
      host: "@",
      value: mx.value,
      purpose: "mx" as const,
      hint: mx.priority === 1 ? "Primärer Google-MX." : "Google-MX Fallback.",
      priority: mx.priority,
    })),
  ];
}

export function mailReady(spf: AuthState, dkim: AuthState, dmarc: AuthState) {
  return spf === "ok" && dkim === "ok" && dmarc === "ok";
}

export function denySendReason(spf: AuthState, dkim: AuthState, dmarc: AuthState) {
  if (mailReady(spf, dkim, dmarc)) return null;
  const missing = [
    spf !== "ok" ? `SPF ${AUTH_STATE_LABELS[spf]}` : null,
    dkim !== "ok" ? `DKIM ${AUTH_STATE_LABELS[dkim]}` : null,
    dmarc !== "ok" ? `DMARC ${AUTH_STATE_LABELS[dmarc]}` : null,
  ].filter(Boolean);
  return `Kein Versand ohne Authentifizierung: ${missing.join(", ")}. Einträge in Google Workspace und im DNS der Domain setzen.`;
}

export function interpretSpfRecord(records: string[], _provider: MailProvider = MAIL_PROVIDER): AuthState {
  const spf = records.find((r) => r.trim().toLowerCase().startsWith("v=spf1"));
  if (!spf) return "fehlt";
  const trimmed = spf.replace(/\s+/g, " ").trim();
  const hardFail = /(?:^|\s)-all$/.test(trimmed);
  const weak = /(?:^|\s)[~?+]all$/.test(trimmed);
  const hasGoogle = trimmed.includes("include:_spf.google.com");
  const hasMicrosoft = trimmed.includes("include:spf.protection.outlook.com");
  if (hasMicrosoft) return "fehlerhaft";
  if (hasGoogle && hardFail && !weak) return "ok";
  return "fehlerhaft";
}

export function interpretDkimGoogle(records: string[], cname?: string[] | null): AuthState {
  if (cname?.some((v) => v.toLowerCase().includes("google"))) return "ok";
  const joined = records.join("");
  if (!/v=dkim1/i.test(joined) && !records.some((r) => r.toLowerCase().includes("v=dkim1"))) return "fehlt";
  const key = /p=([A-Za-z0-9+/=]+)/.exec(joined.replace(/\s+/g, ""));
  if (key?.[1] && key[1].length > 20) return "ok";
  return "fehlerhaft";
}

export function interpretMxGoogle(hosts: string[]): AuthState {
  if (!hosts.length) return "fehlt";
  const normalized = hosts.map((h) => h.toLowerCase().replace(/\.$/, ""));
  const hasPrimary = normalized.some((h) => h === "aspmx.l.google.com" || h.endsWith(".google.com") || h.endsWith(".googlemail.com"));
  const hasMicrosoft = normalized.some((h) => h.includes("outlook.com") || h.includes("protection.outlook"));
  if (hasMicrosoft) return "fehlerhaft";
  return hasPrimary ? "ok" : "fehlerhaft";
}

export function interpretDmarcRecord(records: string[]): { state: AuthState; policy: DmarcPolicy | null } {
  const rec = records.find((r) => r.trim().toLowerCase().startsWith("v=dmarc1"));
  if (!rec) return { state: "fehlt", policy: null };
  const found = /(?:^|;\s*)p=(none|quarantine|reject)\b/i.exec(rec);
  if (!found) return { state: "fehlerhaft", policy: null };
  return { state: "ok", policy: found[1]!.toLowerCase() as DmarcPolicy };
}

export function nextDmarcPolicy(current: DmarcPolicy): DmarcPolicy | null {
  if (current === "none") return "quarantine";
  if (current === "quarantine") return "reject";
  return null;
}

export function isRequiredLocalPart(part: string) {
  return (REQUIRED_LOCAL_PARTS as readonly string[]).includes(part);
}

export function mailboxTypeFor(kind: MailIdentityKind, localPart: string): MailboxType {
  if (localPart === "dmarc") return "reports";
  if (kind === "system") return "system";
  if (kind === "company") return "shared";
  return "user";
}
