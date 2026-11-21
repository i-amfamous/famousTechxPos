/** Suppliers and what the business owes them. */
import { inList, type Db } from "../../core/db.js";
import { bad, notFound } from "../../core/errors.js";
import { cents, money } from "../../core/money.js";
import { nowSql } from "../../core/time.js";
import { clean, n, nullIfEmpty, uuid } from "../../core/values.js";
import { requirePerm, type Actor } from "../../auth/access.js";

export async function listSuppliers(db: Db, actor: Actor) {
  requirePerm(actor, "purchases.manage");
  const sup = await db.all("SELECT * FROM suppliers WHERE organization_id = ? ORDER BY name", [actor.orgId]);
  const pos = await db.all("SELECT id, supplier_id, status, amount_paid FROM purchase_orders WHERE organization_id = ?", [actor.orgId]);
  const items = pos.length ? await db.all(`SELECT purchase_order_id, quantity, unit_cost FROM purchase_items WHERE purchase_order_id IN (${inList(pos.map((p) => p.id))})`, pos.map((p) => p.id)) : [];
  return sup.map((s) => {
    const mine = pos.filter((p) => p.supplier_id === s.id);
    const owed = mine.filter((p) => !["draft", "cancelled"].includes(p.status))
      .reduce((acc, p) => acc + items.filter((i) => i.purchase_order_id === p.id).reduce((b, i) => b + cents(n(i.quantity) * n(i.unit_cost)), 0) - cents(p.amount_paid), 0);
    return { id: s.id, name: s.name, phone: s.phone ?? "", email: s.email ?? undefined, address: s.address ?? undefined, notes: s.notes ?? undefined,
      openOrders: mine.filter((p) => p.status === "ordered" || p.status === "partially_received").length, balance: Math.max(0, money(owed)) };
  });
}

export async function saveSupplier(db: Db, actor: Actor, s: { id?: string; name: string; phone?: string; email?: string; address?: string; notes?: string }) {
  requirePerm(actor, "purchases.manage");
  const name = clean(s.name);
  if (!name) throw bad("name_required", "Enter the supplier's name.");
  const vals = [name, nullIfEmpty(s.phone), nullIfEmpty(s.email), nullIfEmpty(s.address), nullIfEmpty(s.notes)];
  if (s.id) {
    if (!(await db.run("UPDATE suppliers SET name = ?, phone = ?, email = ?, address = ?, notes = ? WHERE id = ? AND organization_id = ?", [...vals, s.id, actor.orgId]))) throw notFound("Supplier not found.");
    return { id: s.id };
  }
  const id = uuid();
  await db.run("INSERT INTO suppliers (id, organization_id, name, phone, email, address, notes, created_at) VALUES (?,?,?,?,?,?,?,?)", [id, actor.orgId, ...vals, nowSql()]);
  return { id };
}
