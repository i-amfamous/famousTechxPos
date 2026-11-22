/**
 * Paystack charge.success webhook. Confirms only a matching, unpaid MoMo tender,
 * and is idempotent so retries and duplicate events cannot pay a sale twice.
 */
import { one, type Db } from "../../core/db.js";
import { bad } from "../../core/errors.js";
import { n } from "../../core/values.js";
import { verifyPaystackSignature } from "./paystack.service.js";
import { emitChange } from "../../realtime/changes.js";

export interface PaystackWebhookInput {
  db: Db;
  body: Record<string, unknown>;
  rawBody?: Buffer;
  signature?: string;
}

export async function handlePaystackWebhook(input: PaystackWebhookInput) {
  if (!input.rawBody || !input.signature || !verifyPaystackSignature(input.rawBody, input.signature))
    throw bad("invalid_paystack_signature", "We couldn't confirm this payment. Please try again.");

  const data = (input.body?.data ?? {}) as Record<string, unknown>;
  if (input.body?.event !== "charge.success" || data.status !== "success") return { ok: true, ignored: true };
  if (data.currency !== undefined && data.currency !== "GHS") return { ok: true, ignored: true };

  const reference = String(data.reference ?? "");
  const pesewas = Number(data.amount ?? 0);
  if (!reference || !(pesewas > 0)) return { ok: true, ignored: true };

  const request = await one(input.db, `SELECT * FROM momo_requests
    WHERE provider = 'paystack' AND provider_reference = ? AND status = 'sent'
    ORDER BY created_at DESC LIMIT 1`, [reference]);
  if (!request || Math.round(n(request.amount) * 100) !== pesewas) return { ok: true, ignored: true };

  await input.db.tx(async (tx) => {
    await tx.run("UPDATE momo_requests SET status = 'paid', message = ? WHERE id = ? AND status = 'sent'",
      ["Paystack payment confirmed on the customer's phone.", request.id]);
    await tx.run("UPDATE payments SET status = 'paid' WHERE id = ? AND organization_id = ?", [request.payment_id, request.organization_id]);
  });
  const sale = await one(input.db, "SELECT branch_id FROM sales WHERE id = ? AND organization_id = ?", [request.sale_id, request.organization_id]);
  emitChange({ orgId: request.organization_id, branchId: sale?.branch_id ?? null, type: "payments" });
  return { ok: true, paid: true, saleId: request.sale_id };
}
