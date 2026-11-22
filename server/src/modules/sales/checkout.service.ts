/**
 * Checkout: one atomic, idempotent transaction that prices the cart, enforces discount/price authority,
 * takes payment, numbers the receipt and moves stock.
 */
import { audit } from "../../core/activity-log.js";
import { inList, isDuplicateKey, one, type Db, type Param, type Row } from "../../core/db.js";
import { bad } from "../../core/errors.js";
import { cents, money } from "../../core/money.js";
import { getSettings } from "../../core/settings.js";
import { nowSql } from "../../core/time.js";
import { bool, clean, n, nullIfEmpty, uuid } from "../../core/values.js";
import { requireBranch, requirePerm, type Actor } from "../../auth/access.js";
import { consumeApproval } from "../approvals/approvals.service.js";
import { applyStock } from "../inventory/stock-ledger.js";
import { PAYMENT_METHODS, saleReceipt } from "./sales.service.js";
import { myOpenShift } from "../shifts/shifts.service.js";
import { detectNetwork, normalizePhone, requestMomoPayment, type MomoNetwork } from "../payments/momo.service.js";
import { verifyPaystackTransaction } from "../payments/paystack.service.js";
import { emitChange } from "../../realtime/changes.js";

/** Marks a MoMo tender paid through the Paystack Inline dialog. Parsed again when the sale is saved. */
const PAYSTACK_REF = "Paystack ";

export interface CheckoutInput {
  terminalId: string; customerId?: string | null; idempotencyKey: string; cartDiscount?: number; discountReason?: string | null;
  discountApprovalId?: string | null; priceApprovalId?: string | null;
  /** Customer details captured at the till. A sale always records them, creating a customer if needed. */
  customer?: { name?: string | null; phone?: string | null; email?: string | null } | null;
  lines: { productId: string; variantId?: string | null; quantity: number; discount?: number; unitPrice?: number | null }[];
  payments: { method: string; amount: number; reference?: string | null; phone?: string | null; network?: string | null; paystackReference?: string | null }[];
}

/** MoMo payments carry the customer number; we store it as `NETWORK phone` for the request and the receipt. */
function paymentReference(pay: CheckoutInput["payments"][number]): string | null {
  if (pay.method !== "momo") return nullIfEmpty(pay.reference);
  // A Paystack Inline reference is already paid. Keep it on the payment for the receipt and the audit row.
  if (pay.paystackReference) return `${PAYSTACK_REF}${pay.paystackReference}`;
  const phone = normalizePhone(pay.phone ?? pay.reference);
  if (!/^0\d{9}$/.test(phone)) throw bad("invalid_momo_number", "Enter a valid customer MoMo number.");
  const network = pay.network && ["MTN", "Telecel", "AT"].includes(pay.network) ? pay.network as MomoNetwork : detectNetwork(phone);
  return `${network} ${phone}`;
}

/**
 * An Inline dialog can call back before Paystack's status has settled everywhere. Never save a sale
 * on a reference that the server cannot confirm, and never trust the amount the browser reports.
 */
async function verifyInlinePayments(p: CheckoutInput): Promise<CheckoutInput> {
  const payments = (p.payments ?? []).map((pay) => ({ ...pay }));
  for (const pay of payments) {
    if (pay.method !== "momo" || !pay.paystackReference) continue;
    const result = await verifyPaystackTransaction(pay.paystackReference);
    if (!result.success) throw bad("paystack_not_paid", "The payment isn't confirmed yet. Finish the payment prompt and try again.");
    if (Math.abs(result.pesewas - cents(pay.amount)) > 1)
      throw bad("paystack_amount_mismatch", "The payment amount didn't match this sale. Please try again.");
  }
  return { ...p, payments };
}

type StoredPayment = CheckoutInput["payments"][number] & { storedRef: string | null };

/**
 * Attaches the customer to every completed sale. If the cashier captured details but no existing
 * customer (a MoMo number is enough), we create one so the sale always lands in customer data.
 * Matching is by phone within the business, so the same buyer never gets duplicate records.
 */
async function resolveCustomerForSale(tx: Db, actor: Actor, p: CheckoutInput, payments: StoredPayment[]): Promise<string | null> {
  const attached = nullIfEmpty(p.customerId);
  if (attached) {
    const found = await one(tx, "SELECT id FROM customers WHERE id = ? AND organization_id = ?", [attached, actor.orgId]);
    if (found) return String(found.id);
  }

  const momo = payments.find((pay) => pay.method === "momo");
  const storedPhone = momo?.storedRef?.startsWith(PAYSTACK_REF) ? "" : (momo?.storedRef ?? "").split(" ").pop() ?? "";
  const raw = p.customer?.phone || momo?.phone || storedPhone || "";
  const phone = normalizePhone(raw);
  const validPhone = /^0\d{9}$/.test(phone) ? phone : "";
  const name = clean(p.customer?.name ?? "");
  const email = nullIfEmpty(p.customer?.email);
  if (!validPhone && !name && !email) return null;

  if (validPhone) {
    const existing = await one(tx, "SELECT id FROM customers WHERE organization_id = ? AND phone = ? ORDER BY created_at LIMIT 1", [actor.orgId, validPhone]);
    if (existing) return String(existing.id);
  } else if (email) {
    const existing = await one(tx, "SELECT id FROM customers WHERE organization_id = ? AND email = ? ORDER BY created_at LIMIT 1", [actor.orgId, email]);
    if (existing) return String(existing.id);
  }

  const id = uuid();
  const label = name || (email ? email.split("@")[0] : `Customer ${validPhone}`);
  await tx.run(`INSERT INTO customers (id, organization_id, name, phone, email, address, notes, status, total_spend, visits, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [id, actor.orgId, label, validPhone || null, email, null, null, "active", 0, 0, nowSql()]);
  return id;
}

/** Records MoMo tenders after the sale is saved. Inline payments are already verified, so they are never re-sent. */
async function dispatchMomo(db: Db, orgId: string, saleId: string, inputPayments: CheckoutInput["payments"] = []) {
  const pays = await db.all("SELECT id, amount, provider_reference FROM payments WHERE sale_id = ? AND method = 'momo' ORDER BY created_at", [saleId]);
  if (!pays.length) return;
  // Paystack sends its receipt here; fall back to a generated address with a valid domain.
  const sale = await db.all("SELECT customer_id FROM sales WHERE id = ?", [saleId]);
  const customerId = sale[0]?.customer_id;
  const customer = customerId ? await db.all("SELECT email FROM customers WHERE id = ?", [customerId]) : [];
  const email = customer[0]?.email ?? null;
  const existing = await db.all("SELECT payment_id FROM momo_requests WHERE sale_id = ?", [saleId]);
  const done = new Set(existing.map((r) => String(r.payment_id)));
  for (const pay of pays) {
    if (done.has(String(pay.id))) continue;
    const stored = String(pay.provider_reference ?? "");
    if (stored.startsWith(PAYSTACK_REF)) {
      const reference = stored.slice(PAYSTACK_REF.length);
      const line = inputPayments.find((x) => x.paystackReference === reference || x.reference === stored);
      const phone = line ? normalizePhone(line.phone ?? "") : "";
      const rawNetwork = line?.network ?? detectNetwork(phone);
      const network = (["MTN", "Telecel", "AT"].includes(rawNetwork) ? rawNetwork : "Unknown") as MomoNetwork;
      await db.run(`INSERT INTO momo_requests (id, organization_id, sale_id, payment_id, network, phone, amount, provider, provider_reference, status, message, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [uuid(), orgId, saleId, pay.id, network, phone, money(n(pay.amount)), "paystack", reference, "paid", "Paid in the Paystack dialog.", nowSql()]);
      await db.run("UPDATE payments SET status = 'paid' WHERE id = ? AND organization_id = ?", [pay.id, orgId]);
      continue;
    }
    const [rawNetwork, phone] = stored.split(" ");
    const network = (["MTN", "Telecel", "AT"].includes(rawNetwork) ? rawNetwork : detectNetwork(phone)) as MomoNetwork;
    const result = await requestMomoPayment({ network, phone: phone ?? "", amount: n(pay.amount), externalId: saleId, email });
    const status = result.sent ? "sent" : "pending";
    await db.run(`INSERT INTO momo_requests (id, organization_id, sale_id, payment_id, network, phone, amount, provider, provider_reference, status, message, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [uuid(), orgId, saleId, pay.id, network, phone ?? "", money(n(pay.amount)), result.provider, result.reference || null, status, result.message, nowSql()]);
    await db.run("UPDATE payments SET status = ? WHERE id = ? AND organization_id = ?", [status, pay.id, orgId]);
  }
}

export async function checkout(db: Db, actor: Actor, p: CheckoutInput) {
  requirePerm(actor, "pos.sell");
  const clientKey = clean(p.idempotencyKey);
  if (!clientKey) throw bad("idempotency_key_required", "We couldn't start this sale. Please try again.");
  // Scope the key to the cashier so two devices generating the same key can't steal each other's receipt.
  const key = `${actor.memberId}:${clientKey}`;

  // Same key → same sale (a retried request never charges twice, and needs no re-verification).
  const prior = await one(db, "SELECT id FROM sales WHERE organization_id = ? AND idempotency_key = ?", [actor.orgId, key]);
  if (prior) { await dispatchMomo(db, actor.orgId, String(prior.id), p.payments); return saleReceipt(db, actor, String(prior.id)); }

  const input = await verifyInlinePayments(p);
  try {
    const saleId = await db.tx((tx) => checkoutTx(tx, actor, input, key));
    await dispatchMomo(db, actor.orgId, saleId, input.payments);
    const created = await one(db, "SELECT branch_id FROM sales WHERE id = ?", [saleId]);
    emitChange({ orgId: actor.orgId, branchId: created?.branch_id ?? null, type: "sales" });
    return saleReceipt(db, actor, saleId);
  } catch (e) {
    if (isDuplicateKey(e)) {
      const again = await one(db, "SELECT id FROM sales WHERE organization_id = ? AND idempotency_key = ?", [actor.orgId, key]);
      if (again) { await dispatchMomo(db, actor.orgId, String(again.id), input.payments); return saleReceipt(db, actor, String(again.id)); }
    }
    throw e;
  }
}

async function checkoutTx(tx: Db, actor: Actor, p: CheckoutInput, key: string): Promise<string> {
  const t = await one(tx, "SELECT * FROM pos_terminals WHERE id = ? AND organization_id = ? AND status = 'active' FOR UPDATE", [p.terminalId, actor.orgId]);
  if (!t) throw bad("unknown_terminal", "This till isn't registered or was revoked.");
  requireBranch(actor, t.branch_id);
  const st = await getSettings(tx, actor.orgId);
  const rate = n(st.tax_rate);
  const incl = st.prices_include_tax !== false;

  const shiftId = await myOpenShift(tx, actor, t.id);
  if (!shiftId && st.require_shift) throw bad("shift_required", "Open a shift before selling.");
  if (!p.lines?.length) throw bad("empty_cart", "The cart is empty.");

  // Pass 1: prices & subtotal (all money in pesewas). One round-trip for all products and variants.
  type L = { product: Row; variant: Row | null; qty: number; price: number; disc: number; alloc: number; tax: number; total: number };
  const productIds = [...new Set(p.lines.map((l) => l.productId))];
  const variantIds = [...new Set(p.lines.map((l) => l.variantId).filter((x): x is string => !!x))];
  const [productRows, variantRows] = await Promise.all([
    tx.all(`SELECT * FROM products WHERE organization_id = ? AND status = 'active' AND id IN (${inList(productIds)})`, [actor.orgId, ...productIds]),
    variantIds.length ? tx.all(`SELECT * FROM product_variants WHERE id IN (${inList(variantIds)})`, variantIds) : Promise.resolve([] as Row[]),
  ]);
  const productMap = new Map(productRows.map((r) => [r.id as string, r]));
  const variantMap = new Map(variantRows.map((r) => [r.id as string, r]));
  const lines: L[] = [];
  let sub = 0, lineDisc = 0, override = false;
  for (const l of p.lines) {
    const product = productMap.get(l.productId);
    if (!product) throw bad("product_unavailable", "A product in the cart is no longer available.");
    const qty = Number(l.quantity);
    if (!(qty > 0)) throw bad("invalid_quantity", "Quantities must be above zero.");
    const variant = l.variantId ? variantMap.get(l.variantId) ?? null : null;
    if (l.variantId && (!variant || variant.product_id !== product.id)) throw bad("product_unavailable", "A product in the cart is no longer available.");
    let price = cents(variant?.selling_price ?? product.selling_price);
    if (l.unitPrice != null && cents(l.unitPrice) !== price) {
      price = cents(l.unitPrice);
      if (price < 0) throw bad("invalid_price", "Price can't be negative.");
      override = true;
    }
    const gross = Math.round(price * qty);
    const disc = cents(l.discount ?? 0);
    if (disc < 0 || disc > gross) throw bad("invalid_discount", "That discount isn't valid.");
    sub += gross; lineDisc += disc;
    lines.push({ product, variant, qty, price, disc, alloc: 0, tax: 0, total: 0 });
  }
  const cartDisc = cents(p.cartDiscount ?? 0);
  if (cartDisc < 0 || lineDisc + cartDisc > sub) throw bad("invalid_discount", "That discount isn't valid.");
  const discTotal = lineDisc + cartDisc;

  // Authority: price override and discounts above the role limit need a manager.
  if (override && !actor.perms.has("pos.price_override")) await consumeApproval(tx, actor, p.priceApprovalId, "price_override", null, null);
  let discApprover: string | null = null;
  if (discTotal > 0 && !actor.isOwner) {
    const pct = sub > 0 ? (discTotal / sub) * 100 : 0;
    if (!actor.perms.has("pos.discount") || pct > n(actor.role.max_discount_percent) + 0.0001)
      discApprover = await consumeApproval(tx, actor, p.discountApprovalId, "discount", money(discTotal), null);
  }

  // Pass 2: spread the cart discount over lines (last line takes the remainder), tax, totals.
  const base = sub - lineDisc;
  let left = cartDisc, tax = 0, cost = 0;
  lines.forEach((l, idx) => {
    const net0 = Math.round(l.price * l.qty) - l.disc;
    l.alloc = idx === lines.length - 1 ? left : base > 0 ? Math.round((cartDisc * net0) / base) : 0;
    left -= idx === lines.length - 1 ? 0 : l.alloc;
    const net = net0 - l.alloc;
    l.tax = bool(l.product.taxable) && rate > 0 ? Math.round(incl ? (net * rate) / (100 + rate) : (net * rate) / 100) : 0;
    l.total = net + (incl ? 0 : l.tax);
    tax += l.tax;
    cost += Math.round(cents(l.product.cost_price) * l.qty);
  });
  const total = sub - discTotal + (incl ? 0 : tax);

  // Payments
  const payments = (p.payments ?? []).map((pay) => ({ ...pay, storedRef: paymentReference(pay) }));
  let paid = 0, cash = 0, nonCash = 0;
  for (const pay of payments) {
    if (!PAYMENT_METHODS.includes(pay.method)) throw bad("invalid_payment", "Choose a valid payment method.");
    const amt = cents(pay.amount);
    if (!(amt > 0)) throw bad("invalid_payment", "Payment amounts must be above zero.");
    paid += amt;
    if (pay.method === "cash") cash += amt; else nonCash += amt;
  }
  if (paid < total) throw bad("payment_short", `Payment doesn't cover the total: ${money(total - paid).toFixed(2)} still due.`);
  if (nonCash > total) throw bad("overpaid_non_cash", "Only cash can be more than the total.");
  const change = paid - total;
  if (change > cash) throw bad("invalid_change", "Change can only come from cash.");

  // Receipt number from the till's own sequence (row is locked above).
  const seq = n(t.receipt_seq) + 1;
  await tx.run("UPDATE pos_terminals SET receipt_seq = ?, last_seen_at = ? WHERE id = ?", [seq, nowSql(), t.id]);
  const br = await one(tx, "SELECT code FROM branches WHERE id = ?", [t.branch_id]);
  const receipt = `${br?.code ?? "BR"}-${t.code}-${String(seq).padStart(6, "0")}`;

  // Every sale records its customer details, creating a customer from the MoMo number when needed.
  const customerId = await resolveCustomerForSale(tx, actor, p, payments);

  const saleId = uuid();
  const now = nowSql();
  await tx.run(`INSERT INTO sales (id, organization_id, branch_id, terminal_id, shift_id, cashier_id, customer_id, receipt_number, idempotency_key, status,
      subtotal, discount_total, tax_total, total, paid_total, change_due, cost_total, refunded_total, discount_approval_id, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [saleId, actor.orgId, t.branch_id, t.id, shiftId, actor.memberId, customerId, receipt, key, "completed",
      money(sub), money(discTotal), money(tax), money(total), money(paid), money(change), money(cost), 0, discApprover ? p.discountApprovalId : null, now]);
  if (discApprover) await tx.run("UPDATE approvals SET used_ref = ? WHERE id = ?", [saleId, p.discountApprovalId]);

  const itemRows: Param[][] = lines.map((l) => [uuid(), actor.orgId, saleId, l.product.id, l.variant?.id ?? null,
    l.variant ? `${l.product.name} - ${l.variant.label}` : l.product.name, l.variant?.sku ?? l.product.sku, l.qty,
    money(l.price), n(l.product.cost_price), money(l.disc + l.alloc), money(l.tax), money(l.total), 0]);
  for (let i = 0; i < itemRows.length; i += 100) {
    const chunk = itemRows.slice(i, i + 100);
    await tx.run(`INSERT INTO sale_items (id, organization_id, sale_id, product_id, variant_id, name_snapshot, sku_snapshot, quantity, unit_price, cost_snapshot, discount, tax, line_total, refunded_quantity)
      VALUES ${chunk.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",")}`, chunk.flat());
  }
  // Stock: aggregate per product/variant so availability is checked once.
  const agg = new Map<string, { productId: string; variantId: string | null; qty: number }>();
  for (const l of lines) {
    const k = `${l.product.id}|${l.variant?.id ?? ""}`;
    const cur = agg.get(k) ?? { productId: l.product.id, variantId: l.variant?.id ?? null, qty: 0 };
    cur.qty += l.qty;
    agg.set(k, cur);
  }
  for (const s of agg.values())
    await applyStock(tx, { orgId: actor.orgId, branchId: t.branch_id, productId: s.productId, variantId: s.variantId, delta: -s.qty, type: "sale", refType: "sale", refId: saleId, actorId: actor.memberId, allowNegative: !st.block_negative_stock, product: productMap.get(s.productId) });

  const payRows: Param[][] = payments.map((pay) => [uuid(), actor.orgId, saleId, pay.method, money(cents(pay.amount)), pay.paystackReference ? "paid" : "recorded", pay.storedRef, actor.memberId, now]);
  for (let i = 0; i < payRows.length; i += 100) {
    const chunk = payRows.slice(i, i + 100);
    await tx.run(`INSERT INTO payments (id, organization_id, sale_id, method, amount, status, provider_reference, recorded_by, created_at)
      VALUES ${chunk.map(() => "(?,?,?,?,?,?,?,?,?)").join(",")}`, chunk.flat());
  }

  if (customerId)
    await tx.run("UPDATE customers SET total_spend = total_spend + ?, visits = visits + 1, last_visit_at = ? WHERE id = ?", [money(total), now, customerId]);

  await audit(tx, { orgId: actor.orgId, actorId: actor.memberId }, "sale", "Completed sale", receipt, { amount: money(total), branchId: t.branch_id, terminalId: t.id, entityType: "sale", entityId: saleId });
  if (discTotal > 0)
    await audit(tx, { orgId: actor.orgId, actorId: actor.memberId }, "discount", "Gave discount", `${receipt}${clean(p.discountReason) ? ` · ${clean(p.discountReason)}` : ""}`,
      { amount: money(discTotal), branchId: t.branch_id, terminalId: t.id, entityType: "sale", entityId: saleId, meta: { approvedBy: discApprover } });
  return saleId;
}
