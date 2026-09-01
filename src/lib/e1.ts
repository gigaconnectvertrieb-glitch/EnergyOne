export const STATUSES = [
  "erfasst",
  "in_pruefung",
  "korrektur_noetig",
  "uebermittelt",
  "bestaetigt",
  "beliefert",
  "abgerechnet",
  "storniert",
] as const;

export type ContractStatus = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<ContractStatus, string> = {
  erfasst: "Geparkt",
  in_pruefung: "In Prüfung",
  korrektur_noetig: "Korrektur nötig",
  uebermittelt: "In New Sales",
  bestaetigt: "Bestätigt",
  beliefert: "Beliefert",
  abgerechnet: "Abgerechnet",
  storniert: "Storniert",
};

export const STATUS_TONE: Record<ContractStatus, "gold" | "warn" | "info" | "success" | "danger" | "muted"> = {
  erfasst: "gold",
  in_pruefung: "info",
  korrektur_noetig: "warn",
  uebermittelt: "muted",
  bestaetigt: "success",
  beliefert: "success",
  abgerechnet: "gold",
  storniert: "danger",
};

export const TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  erfasst: ["in_pruefung", "uebermittelt", "storniert"],
  in_pruefung: ["korrektur_noetig", "uebermittelt", "storniert"],
  korrektur_noetig: ["erfasst", "in_pruefung", "storniert"],
  uebermittelt: ["bestaetigt", "storniert"],
  bestaetigt: ["beliefert", "storniert"],
  beliefert: ["abgerechnet", "storniert"],
  abgerechnet: ["storniert"],
  storniert: [],
};

export const ROLES = [
  "super_admin",
  "gebietsleiter",
  "teamleiter",
  "vertrieb",
  "backoffice",
  "buchhaltung",
  "read_only",
  "partner",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super-Admin",
  gebietsleiter: "Gebietsleiter",
  teamleiter: "Teamleiter",
  vertrieb: "Vertriebsmitarbeiter",
  backoffice: "Backoffice",
  buchhaltung: "Buchhaltung",
  read_only: "Nur-Lesen",
  partner: "Partner / Handelsvertreter",
};

export const PERMISSIONS = [
  "users.manage",
  "roles.assign",
  "contracts.view_all",
  "contracts.edit",
  "contracts.cancel",
  "commissions.approve",
  "commissions.pay",
  "products.manage",
  "reports.export",
  "settings.manage",
  "audit.view",
  "customers.delete",
  "team.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const MATRIX: Record<Role, Permission[]> = {
  super_admin: [...PERMISSIONS],
  gebietsleiter: [
    "contracts.view_all",
    "contracts.edit",
    "contracts.cancel",
    "commissions.approve",
    "reports.export",
    "team.view",
  ],
  teamleiter: [
    "contracts.edit",
    "contracts.cancel",
    "commissions.approve",
    "reports.export",
    "team.view",
  ],
  vertrieb: ["contracts.edit", "reports.export"],
  backoffice: [
    "contracts.view_all",
    "contracts.edit",
    "contracts.cancel",
    "reports.export",
    "customers.delete",
  ],
  buchhaltung: [
    "contracts.view_all",
    "commissions.approve",
    "commissions.pay",
    "reports.export",
  ],
  read_only: ["contracts.view_all", "reports.export"],
  partner: ["contracts.edit", "reports.export"],
};

export function can(role: Role, perm: Permission) {
  return MATRIX[role]?.includes(perm) ?? false;
}

export function canSeeAgency(role: Role) {
  return role === "super_admin" || role === "buchhaltung";
}

export function canChangeStatus(role: Role, from: ContractStatus, to: ContractStatus) {
  if (!TRANSITIONS[from].includes(to)) return false;
  if (to === "storniert") return can(role, "contracts.cancel");
  if (role === "read_only" || role === "buchhaltung") return false;
  return can(role, "contracts.edit") || role === "vertrieb" || role === "partner";
}

export const CANCEL_REASONS = [
  "Widerruf durch Kunden",
  "Doppelabschluss",
  "Unvollständige Unterlagen",
  "Bonität / Schufa",
  "Lieferant abgelehnt",
  "Umzug / nicht lieferbar",
  "Sonstiges",
] as const;

export function isValidIban(iban: string): boolean {
  const cleaned = iban.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(cleaned)) return false;
  if (cleaned.startsWith("DE") && cleaned.length !== 22) return false;
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
  const expanded = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let remainder = 0;
  for (const ch of expanded) {
    remainder = (remainder * 10 + Number(ch)) % 97;
  }
  return remainder === 1;
}

export function formatIban(iban: string) {
  return iban
    .replace(/\s+/g, "")
    .toUpperCase()
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

export type Profile = {
  user_id: string;
  first_name: string;
  last_name: string;
  role: Role;
  user_type: string;
  region_id: string | null;
  region_name?: string | null;
  supervisor_id: string | null;
  status: string;
  phone: string | null;
  monthly_target: number;
  totp_enabled: boolean;
  commission_stufe: 1 | 2 | 3 | 13;
  onboarding_status: string;
  notes: string | null;
  is_demo: boolean;
  email?: string | null;
};

export const FEATURE_DEFAULTS = [
  { key: "phase2_own_tariffs", enabled: false, label: "Eigene E1-Tarife", description: "Eigene Strom- und Gas-Tarife der Marke E1 aktivieren.", phase: "2" },
  { key: "customer_energy_contracts", enabled: false, label: "E1-Stromvertrag erzeugen", description: "Muster-Stromvertrag für Kunden. Aus bis der Lieferant oder Anwalt die Urkunde liefert.", phase: "2" },
  { key: "phase2_self_service", enabled: false, label: "Kunden-Self-Service", description: "Kundenportal für Vertrag, Zählerstand und Rechnungen.", phase: "2" },
  { key: "phase2_market_comm", enabled: false, label: "Marktkommunikation", description: "Vorbereitung MaBiS / GPKE und Abrechnung.", phase: "2" },
  { key: "partner_module", enabled: true, label: "Partner & Handelsvertreter", description: "Freie Handelsvertreter nach § 84 HGB.", phase: "1" },
  { key: "structure_commissions", enabled: true, label: "Strukturprovisionen", description: "Mehrstufige Provisionen für Teamaufbau.", phase: "1" },
  { key: "white_label", enabled: false, label: "White-Label", description: "Eigenes Logo für Partner im Portal.", phase: "2" },
  { key: "recruiting_pipeline", enabled: true, label: "Recruiting & Onboarding", description: "Bewerberpipeline und digitale Freischaltung.", phase: "1" },
  { key: "quality_alerts", enabled: true, label: "Qualitätssteuerung", description: "Stornoquote, Warnungen und Sperren.", phase: "1" },
  { key: "knowledge_area", enabled: true, label: "Wissen & Schulung", description: "Wissensbereich und Schulungsnachweise.", phase: "1" },
  { key: "digital_signature", enabled: true, label: "Digitale Unterschrift", description: "Vor Ort auf dem Tablet oder per E-Mail über DocuSign. Unterschriebenes PDF kommt automatisch in den Auftrag.", phase: "1" },
  { key: "docusign_email", enabled: true, label: "Unterschrift per E-Mail", description: "DocuSign-Versand an den Kunden. Webhook spielt den Vertrag ein.", phase: "1" },
  { key: "notifications", enabled: true, label: "Benachrichtigungen", description: "In-App-Hinweise zu Status und Provision.", phase: "1" },
  { key: "field_routing", enabled: true, label: "Gebiet & Route", description: "Satellitenkarte, Gebiet-Download, nicht angetroffen, Wochenliste. PWA für iPhone und Android.", phase: "1" },
] as const;
