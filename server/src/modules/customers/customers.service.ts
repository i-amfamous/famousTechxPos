/** Customers and their purchase totals. */
import { one, type Db, type Row } from "../../core/db.js";
import { bad, forbidden, notFound } from "../../core/errors.js";
import { iso, nowSql } from "../../core/time.js";
import { clean, n, nullIfEmpty, uuid } from "../../core/values.js";
import { requirePerm, type Actor } from "../../auth/access.js";

export const mapCustomer = (c: Row) => ({
  id: c.id, name: c.name, phone: c.phone ?? "", email: c.email ?? undefined, address: c.address ?? undefined, notes: c.notes ?? undefined,
  totalSpend: n(c.total_spend), visits: n(c.visits), lastVisit: iso(c.last_visit_at) ?? undefined,
});

export async function listCustomers(db: Db, actor: Actor) {
  return (await db.all("SELECT * FROM customers WHERE organization_id = ? AND status = 'active' ORDER BY name LIMIT 2000", [actor.orgId])).map(mapCustomer);
}

export async function saveCustomer(db: Db, actor: Actor, c: { id?: string; name: string; phone?: string; email?: string; address?: string; notes?: string }) {
  if (!(actor.perms.has("customers.manage") || actor.perms.has("pos.sell"))) throw forbidden("permission_denied", "You don't have permission to do that.");
  const name = clean(c.name);
  if (!name) throw bad("name_required", "Enter the customer's name.");
  const vals = [name, nullIfEmpty(c.phone), nullIfEmpty(c.email), nullIfEmpty(c.address), nullIfEmpty(c.notes)];
  let id = c.id;
  if (id) {
    const changed = await db.run("UPDATE customers SET name = ?, phone = ?, email = ?, address = ?, notes = ? WHERE id = ? AND organization_id = ?", [...vals, id, actor.orgId]);
    if (!changed) throw notFound("Customer not found.");
  } else {
    id = uuid();
    await db.run("INSERT INTO customers (id, organization_id, name, phone, email, address, notes, status, total_spend, visits, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [id, actor.orgId, ...vals, "active", 0, 0, nowSql()]);
  }
  return mapCustomer((await one(db, "SELECT * FROM customers WHERE id = ?", [id]))!);
}

export async function archiveCustomer(db: Db, actor: Actor, id: string) {
  requirePerm(actor, "customers.manage");
  await db.run("UPDATE customers SET status = 'archived' WHERE id = ? AND organization_id = ?", [id, actor.orgId]);
}

