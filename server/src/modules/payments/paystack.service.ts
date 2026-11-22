/**
 * Paystack Ghana Mobile Money. One channel handles MTN MoMo, Telecel Cash (Vodafone)
 * and AirtelTigo, so the network detected from the customer's number is metadata,
 * not a separate integration. Amounts sent to Paystack are integer pesewas.
 *
 * The secret key stays on the server. A failure never blocks checkout: callers
 * record the tender as pending and let the webhook confirm it later.
 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { config } from "../../config.js";
import { bad } from "../../core/errors.js";

const API = "https://api.paystack.co";
const MTN = ["024", "025", "026", "054", "059"];
const TELECEL = ["020", "050", "055"];
const AT = ["027", "053", "056", "057"];

function localPhone(raw: string): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("233")) return `0${d.slice(3)}`;
  if (d.length === 9 && !d.startsWith("0")) return `0${d}`;
  return d;
}

function localNetwork(phone: string): string {
  const p = phone.slice(0, 3);
  if (MTN.includes(p)) return "MTN";
  if (TELECEL.includes(p)) return "Telecel";
  if (AT.includes(p)) return "AT";
  return "Unknown";
}

export interface PaystackInitResult {
  reference: string;
  authorizationUrl: string;
}

/** Sends the request-to-pay prompt. Returns Paystack's reference for webhook matching. */
export async function initializePaystackPayment(input: { phone: string; amount: number; externalId: string; email?: string | null }): Promise<PaystackInitResult> {
  if (!config.paystack.secretKey) throw new Error("Paystack isn't configured.");
  const phone = localPhone(input.phone);
  const pesewas = Math.round(Number(input.amount) * 100);
  if (!/^0\d{9}$/.test(phone)) throw new Error("Invalid mobile money number.");
  if (!(pesewas > 0)) throw new Error("Invalid mobile money amount.");

  const reference = `FTX-${randomUUID()}`;
  const res = await fetch(`${API}/transaction/initialize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.paystack.secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      // Paystack validates the address; use a real domain when the till didn't capture one.
      email: input.email || `${phone}@famoustexhpos.com`,
      amount: pesewas,
      currency: "GHS",
      reference,
      ...(config.paystack.callbackUrl ? { callback_url: config.paystack.callbackUrl } : {}),
      // Paystack's Ghana Mobile Money channel has used both locations across API versions.
      mobile_number: phone,
      metadata: { mobile_number: phone, network: localNetwork(phone), saleId: input.externalId },
    }),
    signal: AbortSignal.timeout(9000),
  });
  const json = await res.json() as { status?: boolean; message?: string; data?: { reference?: string; authorization_url?: string } };
  if (!res.ok || json?.status !== true) throw new Error(json?.message ?? `Paystack returned ${res.status}`);
  return {
    reference: String(json.data?.reference ?? reference),
    authorizationUrl: String(json.data?.authorization_url ?? ""),
  };
}

export interface PaystackInlineInit {
  reference: string;
  publicKey: string;
  email: string;
  /** Cedis, so the browser can convert once with Math.round(amount * 100). */
  amount: number;
}

/**
 * Starts a Paystack Inline transaction. The browser gets only the public key and the reference;
 * the dialog collects the customer's contact and mobile money number. No `mobile_number` is sent
 * here, so Paystack does not fire a request-to-pay before the customer confirms in the dialog.
 */
export async function initializePaystackInline(input: { amount: number; email?: string | null; phone?: string | null }): Promise<PaystackInlineInit> {
  if (!config.paystack.secretKey || !config.paystack.publicKey)
    throw bad("paystack_not_configured", "Paystack isn't configured on this server.");

  const pesewas = Math.round(Number(input.amount) * 100);
  if (!(pesewas > 0)) throw bad("invalid_amount", "Enter an amount above zero.");

  const phone = localPhone(String(input.phone ?? ""));
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(input.email ?? "").trim())
    ? String(input.email).trim()
    : phone
      ? `${phone}@famoustexhpos.com`
      : `sale-${Date.now()}@famoustexhpos.com`;

  const reference = `FTX-${randomUUID()}`;
  const res = await fetch(`${API}/transaction/initialize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.paystack.secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      amount: pesewas,
      currency: "GHS",
      reference,
      channels: ["mobile_money"],
      // Inline calls back the browser and we verify server-side. A redirect URL here would hijack the iframe.
      metadata: { source: "Famous TechX POS", integration: "inline", ...(phone ? { customer_phone: phone } : {}) },
    }),
    signal: AbortSignal.timeout(9000),
  });
  const json = await res.json() as { status?: boolean; message?: string; data?: { reference?: string } };
  if (!res.ok || json?.status !== true) throw bad("paystack_init_failed", json?.message ?? "Paystack couldn't start the payment.");
  return {
    reference: String(json.data?.reference ?? reference),
    publicKey: config.paystack.publicKey,
    email,
    amount: pesewas / 100,
  };
}

/** Backup reconciliation when a webhook was missed. */
export async function verifyPaystackTransaction(reference: string): Promise<{ success: boolean; pesewas: number }> {
  if (!config.paystack.secretKey) return { success: false, pesewas: 0 };
  const res = await fetch(`${API}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${config.paystack.secretKey}` },
    signal: AbortSignal.timeout(9000),
  });
  const json = await res.json() as { data?: { status?: string; amount?: number } };
  return { success: json?.data?.status === "success", pesewas: Number(json?.data?.amount ?? 0) };
}

/** Paystack signs the RAW request body with HMAC-SHA512. Never verify the parsed object. */
export function verifyPaystackSignature(raw: Buffer, signature: string): boolean {
  if (!config.paystack.secretKey || !signature) return false;
  const expected = createHmac("sha512", config.paystack.secretKey).update(raw).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
