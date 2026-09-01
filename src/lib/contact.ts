export const PUBLIC_EMAIL = "info@e1direktvertrieb.de";
/** Satellite / sipgate, öffentlich anrufbar. */
export const PUBLIC_PHONE = "015678954406";
export const PUBLIC_PHONE_LABEL = "Satellite · sipgate";

export function formatPhone(raw?: string | null) {
  const digits = (raw || "").replace(/[^\d+]/g, "");
  if (!digits) return "";
  const compact = digits.startsWith("00") ? `+${digits.slice(2)}` : digits;
  if (compact.startsWith("+49")) {
    const rest = compact.slice(3).replace(/^0/, "");
    if (rest.startsWith("156") && rest.length >= 11) return `+49 156 ${rest.slice(3)}`;
    if (rest.length === 10) return `+49 ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}`;
    if (rest.length === 11) return `+49 ${rest.slice(0, 4)} ${rest.slice(4, 7)} ${rest.slice(7)}`;
    return `+49 ${rest}`;
  }
  if (compact.startsWith("0156") && compact.length >= 12) {
    return `0156 ${compact.slice(4)}`;
  }
  if (compact.startsWith("0") && compact.length >= 10) {
    return `${compact.slice(0, 4)} ${compact.slice(4, 7)} ${compact.slice(7)}`;
  }
  return raw?.trim() || "";
}

export function telHref(raw?: string | null) {
  const digits = (raw || "").replace(/[^\d+]/g, "");
  if (!digits) return "";
  const compact = digits.startsWith("00") ? `+${digits.slice(2)}` : digits;
  if (compact.startsWith("0") && !compact.startsWith("00")) return `tel:+49${compact.slice(1)}`;
  return `tel:${compact}`;
}
