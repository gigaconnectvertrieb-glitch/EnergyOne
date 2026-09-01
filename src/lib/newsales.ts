export type NewsalesCustomer = {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  street: string;
  houseNumber: string;
  zip: string;
  city: string;
  birthDate?: string;
};

export type NewsalesOrder = {
  portalId: string;
  advisorId: string;
  advisorName: string;
  customer: NewsalesCustomer;
  productName: string;
  provider: string;
  type: string;
  consumptionKwh: number;
  meterNumber?: string;
  previousProvider?: string;
  startDate?: string;
  notes?: string;
};

export function newsalesConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean((env.NEWSALES_API_URL || "").trim() && (env.NEWSALES_API_KEY || "").trim());
}

export function newsalesBody(order: NewsalesOrder) {
  return {
    source: "e1-direktvertrieb",
    portalId: order.portalId,
    advisor: { id: order.advisorId, name: order.advisorName },
    customer: order.customer,
    product: {
      name: order.productName,
      provider: order.provider,
      type: order.type,
    },
    consumptionKwh: order.consumptionKwh,
    meterNumber: order.meterNumber || null,
    previousProvider: order.previousProvider || null,
    startDate: order.startDate || null,
    notes: order.notes || null,
  };
}

export function mapNewsalesStatus(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (["confirmed", "accepted", "bestaetigt", "bestätigt"].includes(s)) return "bestaetigt";
  if (["delivered", "beliefert", "live"].includes(s)) return "beliefert";
  if (["invoiced", "abgerechnet"].includes(s)) return "abgerechnet";
  if (["cancelled", "canceled", "storniert", "rejected"].includes(s)) return "storniert";
  if (["submitted", "uebermittelt", "übermittelt", "pending"].includes(s)) return "uebermittelt";
  return null;
}
