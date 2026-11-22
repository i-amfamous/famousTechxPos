/** Ghana mobile money helpers shared by the till UI. */

export type MomoNetwork = "MTN" | "Telecel" | "AT" | "Unknown";

const MTN = ["024", "025", "026", "054", "059"];
const TELECEL = ["020", "050", "055"];
const AT = ["027", "053", "056", "057"];

/** Accepts 024…, 23324…, +23324… and spaced numbers; returns the local 0… form. */
export function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("233")) return `0${d.slice(3)}`;
  if (d.length === 9 && !d.startsWith("0")) return `0${d}`;
  return d;
}

export function isValidGhanaPhone(raw: string): boolean {
  return /^0\d{9}$/.test(normalizePhone(raw));
}

/** Picks the provider from the network prefix. Override it if a number has been ported. */
export function detectNetwork(raw: string): MomoNetwork {
  const phone = normalizePhone(raw);
  const prefix = phone.slice(0, 3);
  if (MTN.includes(prefix)) return "MTN";
  if (TELECEL.includes(prefix)) return "Telecel";
  if (AT.includes(prefix)) return "AT";
  return "Unknown";
}

export function networkLabel(network: MomoNetwork): string {
  if (network === "MTN") return "MTN MoMo";
  if (network === "Telecel") return "Telecel Cash";
  if (network === "AT") return "AirtelTigo Money";
  return "Unknown network";
}

export function formatPhone(raw: string): string {
  const p = normalizePhone(raw);
  return p.length === 10 ? `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}` : p;
}
