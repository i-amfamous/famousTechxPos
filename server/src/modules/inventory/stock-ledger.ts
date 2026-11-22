/**
 * The stock ledger. `applyStock` is the only way stock levels change: it locks the row, applies the
 * delta, records the movement and raises low-stock alerts.
 */
import { notify } from "../../core/activity-log.js";
import { isDuplicateKey, one, type Db, type Row } from "../../core/db.js";
import { AppError, bad } from "../../core/errors.js";
import { nowSql } from "../../core/time.js";
import { n, uuid } from "../../core/values.js";

export const fmtQty = (q: number) => String(Math.round(q * 1000) / 1000);

/**
 * The one way stock changes: locks (or creates) the inventory row, applies a delta and records the movement.
 * Must run inside a transaction. Returns the quantity after.
 */
export async function applyStock(db: Db, s: { orgId: string; branchId: string; productId: string; variantId?: string | null; delta: number; type: string;
  reason?: string | null; refType?: string | null; refId?: string | null; actorId?: string | null; allowNegative?: boolean; product?: Row }): Promise<number> {
  const p = s.product ?? await one(db, "SELECT * FROM products WHERE id = ? AND organization_id = ?", [s.productId, s.orgId]);
  if (!p) throw bad("unknown_product", "Product not found.");
  if (p.unit === "job") return 0; // services are not stock-tracked
  const vkey = s.variantId ?? "";
  const lock = () => one(db, "SELECT * FROM inventory WHERE branch_id = ? AND product_id = ? AND variant_key = ? FOR UPDATE", [s.branchId, s.productId, vkey]);
  let inv = await lock();
  if (!inv) {
    try {
      await db.run("INSERT INTO inventory (id, organization_id, branch_id, product_id, variant_key, quantity, updated_at) VALUES (?,?,?,?,?,?,?)",
        [uuid(), s.orgId, s.branchId, s.productId, vkey, 0, nowSql()]);
    } catch (e) { if (!isDuplicateKey(e)) throw e; }
    inv = await lock();
  }
  const before = n(inv!.quantity);
  const after = Math.round((before + s.delta) * 1000) / 1000;
  if (after < 0 && s.allowNegative === false) {
    throw new AppError(409, "insufficient_stock", `Only ${fmtQty(before)} of ${p.name} is left in stock.`);
  }
  await db.run("UPDATE inventory SET quantity = ?, updated_at = ? WHERE id = ?", [after, nowSql(), inv!.id]);
  await db.run(`INSERT INTO stock_movements (id, organization_id, branch_id, product_id, variant_id, movement_type, quantity_delta, quantity_before, quantity_after, reason, reference_type, reference_id, actor_id, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [uuid(), s.orgId, s.branchId, s.productId, s.variantId ?? null, s.type, s.delta, before, after, s.reason ?? null, s.refType ?? null, s.refId ?? null, s.actorId ?? null, nowSql()]);
  const reorder = n(p.reorder_level);
  if (s.delta < 0 && reorder > 0 && before > reorder && after <= reorder) {
    const b = await one(db, "SELECT name FROM branches WHERE id = ?", [s.branchId]);
    await notify(db, s.orgId, "low_stock", `${after <= 0 ? "Out of stock" : "Low stock"}: ${p.name}`,
      `${fmtQty(Math.max(after, 0))} left at ${b?.name ?? "branch"} (reorder level ${fmtQty(reorder)}).`, "inventory.adjust");
  }
  return after;
}
