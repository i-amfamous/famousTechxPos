/** Purchase orders: draft → ordered → (partially) received. Receiving adds stock and updates cost. */
import { audit, notify } from "../../core/activity-log.js";
import { inList, one, type Db } from "../../core/db.js";
import { bad, notFound } from "../../core/errors.js";
import { cents, money } from "../../core/money.js";
import { nextNumber } from "../../core/numbering.js";
import { iso, nowSql } from "../../core/time.js";
import { clean, n, nullIfEmpty, uuid } from "../../core/values.js";
import { requireBranch, requirePerm, type Actor } from "../../auth/access.js";
import { applyStock } from "../inventory/stock-ledger.js";

export async function listPurchaseOrders(db: Db, actor: Actor) {
  requirePerm(actor, "purchases.manage");
  const branches = [...actor.branchIds];
  const pos = branches.length
    ? await db.all(`SELECT * FROM purchase_orders WHERE organization_id = ? AND branch_id IN (${inList(branches)}) ORDER BY created_at DESC`, [actor.orgId, ...branches])
    : [];
  const items = pos.length ? await db.all(`SELECT * FROM purchase_items WHERE purchase_order_id IN (${inList(pos.map((p) => p.id))})`, pos.map((p) => p.id)) : [];
  return pos.map((p) => ({ id: p.id, number: p.number, supplierId: p.supplier_id, branchId: p.branch_id, status: p.status, createdAt: iso(p.created_at),
    expectedAt: p.expected_at ?? undefined, supplierReference: p.supplier_reference ?? undefined,
    lines: items.filter((l) => l.purchase_order_id === p.id).map((l) => ({ id: l.id, productId: l.product_id, quantity: n(l.quantity), received: n(l.received_quantity), unitCost: n(l.unit_cost) })) }));
}

export async function savePurchaseOrder(db: Db, actor: Actor, p: { supplierId: string; branchId: string; expectedAt?: string | null; place: boolean; lines: { productId: string; quantity: number; unitCost: number }[] }) {
  requirePerm(actor, "purchases.manage");
  requireBranch(actor, p.branchId);
  if (!(await one(db, "SELECT id FROM suppliers WHERE id = ? AND organization_id = ?", [p.supplierId, actor.orgId]))) throw bad("invalid_supplier", "Choose a supplier.");
  const lines = (p.lines ?? []).filter((l) => n(l.quantity) > 0);
  if (!lines.length) throw bad("empty_order", "Add at least one product.");
  const ids = [...new Set(lines.map((l) => l.productId))];
  const found = await db.all(`SELECT id FROM products WHERE organization_id = ? AND id IN (${inList(ids)})`, [actor.orgId, ...ids]);
  if (found.length !== ids.length) throw bad("unknown_product", "One of the products wasn't found.");
  return db.tx(async (tx) => {
    const id = uuid();
    const number = await nextNumber(tx, "purchase_orders", actor.orgId, "PO");
    await tx.run("INSERT INTO purchase_orders (id, organization_id, branch_id, supplier_id, number, status, expected_at, amount_paid, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [id, actor.orgId, p.branchId, p.supplierId, number, p.place ? "ordered" : "draft", nullIfEmpty(p.expectedAt), 0, actor.memberId, nowSql()]);
    for (const l of lines)
      await tx.run("INSERT INTO purchase_items (id, purchase_order_id, product_id, quantity, received_quantity, unit_cost) VALUES (?,?,?,?,?,?)",
        [uuid(), id, l.productId, n(l.quantity), 0, money(cents(l.unitCost))]);
    await audit(tx, { orgId: actor.orgId, actorId: actor.memberId }, "stock", "Created purchase order", number, { branchId: p.branchId, entityType: "purchase_order", entityId: id });
    return { id, number };
  });
}

export async function setPurchaseOrderStatus(db: Db, actor: Actor, id: string, status: string) {
  requirePerm(actor, "purchases.manage");
  const po = await one(db, "SELECT * FROM purchase_orders WHERE id = ? AND organization_id = ?", [id, actor.orgId]);
  if (!po) throw notFound("Purchase order not found.");
  requireBranch(actor, po.branch_id);
  if (!["ordered", "cancelled"].includes(status) || ["received", "cancelled"].includes(po.status) || (status === "cancelled" && po.status === "partially_received"))
    throw bad("invalid_status_change", "That status change isn't allowed.");
  await db.run("UPDATE purchase_orders SET status = ? WHERE id = ?", [status, id]);
  await audit(db, { orgId: actor.orgId, actorId: actor.memberId }, "stock", `Purchase order ${status}`, po.number, { branchId: po.branch_id });
}

export async function receivePurchaseOrder(db: Db, actor: Actor, id: string, i: { lines: { itemId: string; quantity: number }[]; reference?: string | null }) {
  requirePerm(actor, "purchases.manage");
  return db.tx(async (tx) => {
    const po = await one(tx, "SELECT * FROM purchase_orders WHERE id = ? AND organization_id = ? FOR UPDATE", [id, actor.orgId]);
    if (!po) throw notFound("Purchase order not found.");
    if (!["ordered", "partially_received"].includes(po.status)) throw bad("not_receivable", "Place the order before receiving it.");
    requireBranch(actor, po.branch_id);
    const ref = clean(i.reference);
    // Aggregate duplicate item lines first, then cap each receipt at the quantity still outstanding.
    const wanted = new Map<string, number>();
    for (const l of i.lines ?? []) {
      const q = n(l.quantity);
      if (!(q > 0)) continue;
      wanted.set(l.itemId, (wanted.get(l.itemId) ?? 0) + q);
    }
    if (!wanted.size) throw bad("nothing_to_receive", "Enter at least one quantity.");
    for (const [itemId, q] of wanted) {
      const it = await one(tx, "SELECT * FROM purchase_items WHERE id = ? AND purchase_order_id = ? FOR UPDATE", [itemId, id]);
      if (!it) throw bad("unknown_item", "One of the lines wasn't found.");
      const remaining = n(it.quantity) - n(it.received_quantity);
      if (q > remaining + 1e-9) throw bad("over_received", "You can't receive more than the quantity still outstanding.");
      await tx.run("UPDATE purchase_items SET received_quantity = received_quantity + ? WHERE id = ?", [q, it.id]);
      await applyStock(tx, { orgId: actor.orgId, branchId: po.branch_id, productId: it.product_id, delta: q, type: "receipt", reason: `${po.number}${ref ? ` · ${ref}` : ""}`, refType: "purchase_order", refId: id, actorId: actor.memberId });
      await tx.run("UPDATE products SET cost_price = ?, updated_at = ? WHERE id = ?", [n(it.unit_cost), nowSql(), it.product_id]);
    }
    const left = await one(tx, "SELECT COUNT(*) AS c FROM purchase_items WHERE purchase_order_id = ? AND received_quantity < quantity", [id]);
    await tx.run("UPDATE purchase_orders SET status = ?, supplier_reference = COALESCE(?, supplier_reference) WHERE id = ?", [n(left?.c) === 0 ? "received" : "partially_received", ref || null, id]);
    const br = await one(tx, "SELECT name FROM branches WHERE id = ?", [po.branch_id]);
    await audit(tx, { orgId: actor.orgId, actorId: actor.memberId }, "stock", "Received purchase order", po.number, { branchId: po.branch_id, entityType: "purchase_order", entityId: id });
    await notify(tx, actor.orgId, "purchase", `${po.number} received`, `Stock added to ${br?.name ?? "branch"}`, "purchases.manage");
  });
}
