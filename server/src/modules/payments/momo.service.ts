/**
 * Mobile money request-to-pay. The network is read from the customer's number,
 * so one checkout can route to MTN MoMo, Telecel Cash or AirtelTigo Money.
 *
 * Providers are optional: with no credentials the request is recorded as pending
 * and the sale still completes. No provider error can ever fail a checkout.
 */
import { randomUUID } from "node:crypto";
import { config } from "../../config.js";

export type MomoNetwork = "MTN" | "Telecel" | "AT" | "Unknown";

const MTN_PREFIXES = ["024", "025", "026", "054", "059"];
const TELECEL_PREFIXES = ["020", "050", "055"];
const AT_PREFIXES = ["027", "053", "056", "057"];

export function normalizePhone(raw?: string | null): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("233")) return `0${d.slice(3)}`;
  if (d.length === 9 && !d.startsWith("0")) return `0${d}`;
  return d;
}

export function detectNetwork(raw?: string | null): MomoNetwork {
  const prefix = normalizePhone(raw).slice(0, 3);
  if (MTN_PREFIXES.includes(prefix)) return "MTN";
  if (TELECEL_PREFIXES.includes(prefix)) return "Telecel";
  if (AT_PREFIXES.includes(prefix)) return "AT";
  return "Unknown";
}

export interface MomoPaymentRequest {
  network: MomoNetwork;
  phone: string;
  amount: number;
  externalId: string;
}

export interface MomoPaymentResult {
  provider: string;
  sent: boolean;
  reference: string;
  message: string;
}

const toMsisdn = (phone: string) => `233${normalizePhone(phone).slice(1)}`;

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(9000) });
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try { json = text ? JSON.parse(text) as Record<string, unknown> : null; } catch { /* non-JSON response */ }
  return { ok: res.ok, status: res.status, json };
}

function extractReference(json: Record<string, unknown> | null): string {
  if (!json) return "";
  for (const k of ["reference", "transactionId", "transaction_id", "requestId", "id"]) {
    const v = json[k];
    if (typeof v === "string" || typeof v === "number") return String(v);
  }
  return "";
}

function pending(provider: string, message: string): MomoPaymentResult {
  return { provider, sent: false, reference: "", message };
}

async function requestMtn(req: MomoPaymentRequest): Promise<MomoPaymentResult> {
  const cfg = config.momo.mtn;
  if (!cfg.baseUrl || !cfg.apiUser || !cfg.apiKey || !cfg.subscriptionKey)
    return pending("mtn", "MTN MoMo isn't configured on this server. Payment recorded as pending; follow up with the customer.");

  try {
    const auth = Buffer.from(`${cfg.apiUser}:${cfg.apiKey}`).toString("base64");
    const token = await postJson(`${cfg.baseUrl}/v1/token/`, { Authorization: `Basic ${auth}`, "Ocp-Apim-Subscription-Key": cfg.subscriptionKey, "Content-Type": "application/json" }, {});
    const access = token.json?.access_token;
    if (!token.ok || typeof access !== "string")
      return pending("mtn", `MTN MoMo couldn't be reached (${token.status}). Payment recorded as pending.`);

    const reference = randomUUID();
    const result = await postJson(`${cfg.baseUrl}/v1/requesttopay`, {
      Authorization: `Bearer ${access}`,
      "X-Reference-Id": reference,
      "X-Target-Environment": cfg.targetEnv,
      "Ocp-Apim-Subscription-Key": cfg.subscriptionKey,
      "Content-Type": "application/json",
      ...(config.momo.callbackUrl ? { "X-Callback-Url": config.momo.callbackUrl } : {}),
    }, {
      amount: req.amount.toFixed(2), currency: "GHS", externalId: req.externalId,
      payer: { partyIdType: "MSISDN", partyId: toMsisdn(req.phone) },
      payerMessage: "Famous TechX POS payment", payeeNote: `Sale ${req.externalId}`,
    });
    if (!result.ok && result.status !== 201 && result.status !== 202)
      return pending("mtn", `MTN MoMo declined the request (${result.status}). Payment recorded as pending.`);
    return { provider: "mtn", sent: true, reference, message: `MTN MoMo request sent to ${req.phone}. Ask the customer to approve it on their phone.` };
  } catch {
    return pending("mtn", "MTN MoMo couldn't be reached right now. Payment recorded as pending; follow up with the customer.");
  }
}

async function requestGeneric(label: string, provider: string, cfg: { baseUrl: string; apiKey: string; merchantId: string; path: string }, req: MomoPaymentRequest): Promise<MomoPaymentResult> {
  if (!cfg.baseUrl || !cfg.apiKey)
    return pending(provider, `${label} isn't configured on this server. Payment recorded as pending; follow up with the customer.`);

  try {
    const result = await postJson(`${cfg.baseUrl}${cfg.path}`, {
      Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json", "X-Merchant-Id": cfg.merchantId,
    }, {
      msisdn: toMsisdn(req.phone), amount: req.amount.toFixed(2), currency: "GHS",
      merchantId: cfg.merchantId, externalId: req.externalId,
      ...(config.momo.callbackUrl ? { callbackUrl: config.momo.callbackUrl } : {}),
    });
    if (!result.ok && result.status !== 201 && result.status !== 202)
      return pending(provider, `${label} declined the request (${result.status}). Payment recorded as pending.`);
    return { provider, sent: true, reference: extractReference(result.json) || randomUUID(), message: `${label} request sent to ${req.phone}. Ask the customer to approve it on their phone.` };
  } catch {
    return pending(provider, `${label} couldn't be reached right now. Payment recorded as pending; follow up with the customer.`);
  }
}

/** Sends one request-to-pay. Always resolves, so a provider outage never blocks a sale. */
export async function requestMomoPayment(req: MomoPaymentRequest): Promise<MomoPaymentResult> {
  if (req.network === "MTN") return requestMtn(req);
  if (req.network === "Telecel") return requestGeneric("Telecel Cash", "telecel", config.momo.telecel, req);
  if (req.network === "AT") return requestGeneric("AirtelTigo Money", "at", config.momo.at, req);
  return pending("none", `No mobile money provider matches ${req.phone}. Payment recorded as pending; confirm the network with the customer.`);
}
