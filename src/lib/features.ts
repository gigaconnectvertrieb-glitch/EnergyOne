export const STAFF_UNLOCKS = [
  { key: "phase2_own_tariffs", label: "Eigene E1-Tarife" },
  { key: "full_contract", label: "Voller Vertrag (SEPA, AGB, Unterschrift)" },
  { key: "digital_signature", label: "Tablet- & DocuSign-Unterschrift" },
  { key: "phase2_self_service", label: "Kundenportal" },
  { key: "structure_commissions", label: "Strukturprovision" },
  { key: "partner_module", label: "Partner / Handelsvertreter" },
] as const;

export type StaffUnlockKey = (typeof STAFF_UNLOCKS)[number]["key"];

export const ALL_FEATURE_KEYS = [
  "phase2_own_tariffs",
  "phase2_self_service",
  "phase2_market_comm",
  "partner_module",
  "structure_commissions",
  "white_label",
  "recruiting_pipeline",
  "quality_alerts",
  "knowledge_area",
  "digital_signature",
  "notifications",
  "field_routing",
  "full_contract",
] as const;

export const DEFAULT_STAFF_FLAGS: Record<string, boolean> = {
  field_routing: true,
  knowledge_area: true,
  notifications: true,
  quality_alerts: true,
  recruiting_pipeline: false,
  partner_module: false,
  structure_commissions: false,
  white_label: false,
  digital_signature: false,
  phase2_own_tariffs: false,
  phase2_self_service: false,
  phase2_market_comm: false,
  full_contract: false,
};

export function allFlagsOn(): Record<string, boolean> {
  const m: Record<string, boolean> = {};
  for (const k of ALL_FEATURE_KEYS) m[k] = true;
  return m;
}
