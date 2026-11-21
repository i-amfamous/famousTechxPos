/** Stock adjustments, scan-to-receive and the movement history. */
import { audit } from "../../core/activity-log.js";
import { one, type Db } from "../../core/db.js";
import { bad, notFound } from "../../core/errors.js";
import { cents, money } from "../../core/money.js";
import { iso, nowSql } from "../../core/time.js";
import { clean, n } from "../../core/values.js";
import { requireBranch, requirePerm, type Actor } from "../../auth/access.js";
import { applyStock, fmtQty } from "./stock-ledger.js";

export async function listStockMovements(db: Db, actor: Actor, branchId: string) {
  requireBranch(actor, branchId);
  const rows = await db.all("SELECT * FROM stock_movements WHERE branch_id = ? ORDER BY created_at DESC LIMIT 300", [branchId]);
  return rows.map((m) => ({ id: m.id, productId: m.product_id, type: m.movement_type === "opening" ? "receipt" : m.movement_type === "void" ? "return" : m.movement_type,
    delta: n(m.quantity_delta), reason: m.reason ?? undefined, actorId: m.actor_id ?? "", createdAt: iso(m.created_at) }));
}

/** mode: add | remove | set. Returns the quantity after. */
export async function adjustStock(db: Db, actor: Actor, i: { branchId: string; productId: string; variantId?: string | null; mode: string; quantity: number; reason: string }) {
  requirePerm(actor, "inventory.adjust");
  requireBranch(actor, i.branchId);
  if (!clean(i.reason)) throw bad("reason_required", "Please give a reason.");
  const q = n(i.quantity);
  if (!(q >= 0)) throw bad("invalid_quantity", "Enter a valid quantity.");
  return db.tx(async (tx) => {
    const p = await one(tx, "SELECT * FROM products WHERE id = ? AND organization_id = ?", [i.productId, actor.orgId]);
    if (!p) throw notFound("Product not found.");
    const cur = n((await one(tx, "SELECT quantity FROM inventory WHERE branch_id = ? AND product_id = ? AND variant_key = ?", [i.branchId, i.productId, i.variantId ?? ""]))?.quantity);
    const delta = i.mode === "add" ? q : i.mode === "remove" ? -q : i.mode === "set" ? q - cur : NaN;
    if (Number.isNaN(delta)) throw bad("invalid_mode", "Unknown adjustment type.");
    if (delta === 0) return { quantity: cur };
    const type = /^(damaged|expired)/i.test(clean(i.reason)) ? "damaged" : "adjustment";
    const after = await applyStock(tx, { orgId: actor.orgId, branchId: i.branchId, productId: i.productId, variantId: i.variantId, delta, type, reason: clean(i.reason), refType: "adjustment", actorId: actor.memberId, allowNegative: false });
    await audit(tx, { orgId: actor.orgId, actorId: actor.memberId }, "stock", "Stock adjustment", `${p.name}: ${fmtQty(cur)} → ${fmtQty(after)} (${clean(i.reason)})`, { branchId: i.branchId, entityType: "product", entityId: i.productId });
    return { quantity: after };
  });
}

/** Scan-to-receive: add stock (optionally updating the cost price). */
export async function receiveStock(db: Db, actor: Actor, i: { branchId: string; productId: string; variantId?: string | null; quantity: number; unitCost?: number | null; reference?: string | null }) {
  requirePerm(actor, "inventory.adjust");
  requireBranch(actor, i.branchId);
  const q = n(i.quantity);
  if (!(q > 0)) throw bad("invalid_quantity", "Enter a quantity above zero.");
  return db.tx(async (tx) => {
    const p = await one(tx, "SELECT * FROM products WHERE id = ? AND organization_id = ?", [i.productId, actor.orgId]);
    if (!p) throw notFound("Product not found.");
    const after = await applyStock(tx, { orgId: actor.orgId, branchId: i.branchId, productId: i.productId, variantId: i.variantId, delta: q, type: "receipt", reason: clean(i.reference) || "Received", refType: "receipt", actorId: actor.memberId });
    if (i.unitCost != null && n(i.unitCost) >= 0) await tx.run("UPDATE products SET cost_price = ?, updated_at = ? WHERE id = ?", [money(cents(i.unitCost)), nowSql(), i.productId]);
    await audit(tx, { orgId: actor.orgId, actorId: actor.memberId }, "stock", "Received stock", `${p.name} +${fmtQty(q)}${clean(i.reference) ? ` · ${clean(i.reference)}` : ""}`, { branchId: i.branchId, entityType: "product", entityId: i.productId });
    return { quantity: after };
  });
}
