/** Refunds (partial, pro-rata, optional restock) and voids (whole sale, stock returned). */
import { audit, notify } from "../../core/activity-log.js";
import { one, type Db, type Row } from "../../core/db.js";
import { bad, forbidden, notFound } from "../../core/errors.js";
import { cents, money } from "../../core/money.js";
import { nowSql } from "../../core/time.js";
import { clean, n, uuid } from "../../core/values.js";
import { requireBranch, type Actor } from "../../auth/access.js";
import { consumeApproval } from "../approvals/approvals.service.js";
import { applyStock } from "../inventory/stock-ledger.js";
import { PAYMENT_METHODS } from "./sales.service.js";
import { myOpenShift } from "../shifts/shifts.service.js";

export async function refundSale(db: Db, actor: Actor, saleId: string, i: { items: { saleItemId: string; quantity: number }[]; reason: string; restock: boolean; method: string; approvalId?: string | null; terminalId?: string | null }) {
  if (!clean(i.reason)) throw bad("reason_required", "Please give a reason.");
  if (!PAYMENT_METHODS.includes(i.method)) throw bad("invalid_payment", "Unknown refund method.");
  return db.tx(async (tx) => {
    const s = await one(tx, "SELECT * FROM sales WHERE id = ? AND organization_id = ? FOR UPDATE", [saleId, actor.orgId]);
    if (!s) throw notFound("Sale not found.");
    if (s.status === "voided" || s.status === "refunded") throw bad("not_refundable", "This sale can't be refunded.");
    requireBranch(actor, s.branch_id);

    // Amount = pro-rata of what the customer actually paid for each line.
    const plan: { item: Row; qty: number; amount: number }[] = [];
    let amount = 0;
    for (const it of i.items ?? []) {
      const q = Number(it.quantity);
      if (!(q > 0)) continue;
      const si = await one(tx, "SELECT * FROM sale_items WHERE id = ? AND sale_id = ? FOR UPDATE", [it.saleItemId, saleId]);
      if (!si || q > n(si.quantity) - n(si.refunded_quantity) + 1e-9) throw bad("refund_quantity_too_high", "That's more than can be refunded.");
      const amt = Math.round((cents(si.line_total) * q) / n(si.quantity));
      plan.push({ item: si, qty: q, amount: amt });
      amount += amt;
    }
    if (amount <= 0) throw bad("nothing_to_refund", "Choose at least one item to refund.");

    let approver: string | null = null;
    if (!actor.isOwner && (!actor.perms.has("sales.refund") || money(amount) > n(actor.role.max_refund_amount)))
      approver = await consumeApproval(tx, actor, i.approvalId, "refund", money(amount), saleId);

    let shiftId: string | null = i.terminalId ? await myOpenShift(tx, actor, i.terminalId) : null;
    if (i.method === "cash" && !shiftId)
      shiftId = (await one(tx, "SELECT id FROM shifts WHERE member_id = ? AND organization_id = ? AND branch_id = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 1",
        [actor.memberId, actor.orgId, s.branch_id]))?.id ?? null;

    const refundId = uuid();
    await tx.run("INSERT INTO refunds (id, organization_id, original_sale_id, shift_id, amount, method, status, reason, restocked, actor_id, approval_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      [refundId, actor.orgId, saleId, shiftId, money(amount), i.method, i.method === "cash" ? "recorded" : "pending", clean(i.reason), !!i.restock, actor.memberId, i.approvalId ?? null, nowSql()]);
    for (const p of plan) {
      await tx.run("INSERT INTO refund_items (id, refund_id, sale_item_id, quantity, amount) VALUES (?,?,?,?,?)", [uuid(), refundId, p.item.id, p.qty, money(p.amount)]);
      await tx.run("UPDATE sale_items SET refunded_quantity = refunded_quantity + ? WHERE id = ?", [p.qty, p.item.id]);
      if (i.restock)
        await applyStock(tx, { orgId: actor.orgId, branchId: s.branch_id, productId: p.item.product_id, variantId: p.item.variant_id, delta: p.qty, type: "return",
          reason: `Refund ${s.receipt_number}: ${clean(i.reason)}`, refType: "refund", refId: refundId, actorId: actor.memberId });
    }
    const left = await one(tx, "SELECT COUNT(*) AS c FROM sale_items WHERE sale_id = ? AND refunded_quantity < quantity", [saleId]);
    await tx.run("UPDATE sales SET refunded_total = refunded_total + ?, status = ? WHERE id = ?", [money(amount), n(left?.c) === 0 ? "refunded" : "partially_refunded", saleId]);
    if (s.customer_id) await tx.run("UPDATE customers SET total_spend = CASE WHEN total_spend > ? THEN total_spend - ? ELSE 0 END WHERE id = ?", [money(amount), money(amount), s.customer_id]);
    await audit(tx, { orgId: actor.orgId, actorId: actor.memberId }, "refund", "Issued refund", `${s.receipt_number} · ${clean(i.reason)}`,
      { amount: money(amount), branchId: s.branch_id, terminalId: i.terminalId ?? null, entityType: "sale", entityId: saleId, meta: { approvedBy: approver, restocked: !!i.restock } });
    await notify(tx, actor.orgId, "refund", "Refund issued", `${money(amount).toFixed(2)} on ${s.receipt_number}`, "sales.view_all");
    return { refundId, amount: money(amount) };
  });
}

export async function voidSale(db: Db, actor: Actor, saleId: string, i: { reason: string; approvalId?: string | null }) {
  if (!clean(i.reason)) throw bad("reason_required", "Please give a reason.");
  return db.tx(async (tx) => {
    const s = await one(tx, "SELECT * FROM sales WHERE id = ? AND organization_id = ? FOR UPDATE", [saleId, actor.orgId]);
    if (!s || s.status !== "completed" || n(s.refunded_total) > 0) throw bad("not_voidable", "Only completed sales with no refunds can be voided.");
    if (!actor.branchIds.has(s.branch_id)) throw forbidden("not_allowed", "You don't have access to this branch.");
    if (!actor.perms.has("sales.void")) await consumeApproval(tx, actor, i.approvalId, "void", n(s.total), saleId);
    const lines = await tx.all("SELECT product_id, variant_id, quantity FROM sale_items WHERE sale_id = ?", [saleId]);
    const agg = new Map<string, { p: string; v: string | null; q: number }>();
    for (const l of lines) { const k = `${l.product_id}|${l.variant_id ?? ""}`; const c = agg.get(k) ?? { p: l.product_id, v: l.variant_id, q: 0 }; c.q += n(l.quantity); agg.set(k, c); }
    for (const x of agg.values())
      await applyStock(tx, { orgId: actor.orgId, branchId: s.branch_id, productId: x.p, variantId: x.v, delta: x.q, type: "void", reason: `Void ${s.receipt_number}`, refType: "sale", refId: saleId, actorId: actor.memberId });
    await tx.run("UPDATE sales SET status = 'voided', void_reason = ?, voided_by = ?, voided_at = ? WHERE id = ?", [clean(i.reason), actor.memberId, nowSql(), saleId]);
    await tx.run("UPDATE payments SET status = 'refunded' WHERE sale_id = ?", [saleId]);
    // If the cash is returned in a later shift, reduce that drawer's expected cash explicitly.
    const voidShift = actor.terminalId ? await myOpenShift(tx, actor, actor.terminalId) : null;
    if (voidShift && voidShift !== s.shift_id && n(s.total) > 0)
      await tx.run("INSERT INTO cash_movements (id, organization_id, shift_id, type, amount, reason, actor_id, approval_id, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
        [uuid(), actor.orgId, voidShift, "paid_out", n(s.total), `Void ${s.receipt_number}`, actor.memberId, null, nowSql()]);
    if (s.customer_id)
      await tx.run("UPDATE customers SET total_spend = CASE WHEN total_spend > ? THEN total_spend - ? ELSE 0 END, visits = CASE WHEN visits > 0 THEN visits - 1 ELSE 0 END WHERE id = ?",
        [n(s.total), n(s.total), s.customer_id]);
    await audit(tx, { orgId: actor.orgId, actorId: actor.memberId }, "refund", "Voided sale", `${s.receipt_number} · ${clean(i.reason)}`, { amount: n(s.total), branchId: s.branch_id, terminalId: s.terminal_id, entityType: "sale", entityId: saleId });
  });
}
