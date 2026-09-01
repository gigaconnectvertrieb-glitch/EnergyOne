export function cleanIban(raw?: string | null) {
  return (raw || "").replace(/\s+/g, "").toUpperCase();
}

export function ibanLooksValid(iban: string) {
  return /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban);
}

/** Leer erlaubt. Nur wenn etwas steht, muss es eine IBAN sein. */
export function optionalIban(raw?: string | null) {
  const iban = cleanIban(raw);
  if (!iban) return "";
  if (!ibanLooksValid(iban)) throw new Error("IBAN ist ungültig.");
  return iban;
}
