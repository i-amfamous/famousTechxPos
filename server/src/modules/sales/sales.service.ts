/** Sales history, sale detail and receipts. Cashiers see their own sales; `sales.view_all` sees the branch. */
import { inList, one, type Db, type Row } from "../../core/db.js";
import { notFound } from "../../core/errors.js";
import { getSettings } from "../../core/settings.js";
import { iso } from "../../core/time.js";
import { bool, n } from "../../core/values.js";
import { requireBranch, type Actor } from "../../auth/access.js";

export const mapSale = (s: Row, items: Row[], payments: Row[]) => ({
  id: s.id, receiptNumber: s.receipt_number, createdAt: iso(s.created_at), cashierId: s.cashier_id, terminalId: s.terminal_id ?? "",
  shiftId: s.shift_id ?? "", branchId: s.branch_id, customerId: s.customer_id ?? undefined, status: s.status,
  items: items.map((i) => ({ id: i.id, name: i.name_snapshot, sku: i.sku_snapshot, quantity: n(i.quantity), unitPrice: n(i.unit_price), discount: n(i.discount), lineTotal: n(i.line_total), refundedQuantity: n(i.refunded_quantity) })),
  payments: payments.map((p) => ({ method: p.method, amount: n(p.amount), reference: p.provider_reference ?? undefined })),
  subtotal: n(s.subtotal), discountTotal: n(s.discount_total), taxTotal: n(s.tax_total), total: n(s.total), changeDue: n(s.change_due), refundedTotal: n(s.refunded_total),
});

export const PAYMENT_METHODS = ["cash", "momo", "card", "bank"];

function canSeeSale(actor: Actor, s: Row) {
  return actor.perms.has("sales.view_all") ? actor.branchIds.has(s.branch_id) || actor.isOwner : s.cashier_id === actor.memberId;
}

/** Receipt payload for a sale (after checkout and for reprints). */
export async function saleReceipt(db: Db, actor: Actor, saleId: string) {
  const s = await one(db, "SELECT * FROM sales WHERE id = ? AND organization_id = ?", [saleId, actor.orgId]);
  if (!s || !canSeeSale(actor, s)) throw notFound("Sale not found.");
  const [br, t, m, c, biz] = await Promise.all([
    one(db, "SELECT name FROM branches WHERE id = ?", [s.branch_id]),
    s.terminal_id ? one(db, "SELECT name FROM pos_terminals WHERE id = ?", [s.terminal_id]) : null,
    one(db, "SELECT display_name, full_name FROM business_members WHERE id = ?", [s.cashier_id]),
    s.customer_id ? one(db, "SELECT name FROM customers WHERE id = ?", [s.customer_id]) : null,
    one(db, "SELECT * FROM businesses WHERE id = ?", [s.organization_id]),
  ]);
  const settings = await getSettings(db, actor.orgId);
  const items = await db.all("SELECT * FROM sale_items WHERE sale_id = ? ORDER BY name_snapshot", [saleId]);
  const pays = await db.all("SELECT * FROM payments WHERE sale_id = ? ORDER BY created_at", [saleId]);
  return {
    saleId: s.id, receiptNumber: s.receipt_number, createdAt: iso(s.created_at), servedBy: m?.display_name ?? "", terminal: t?.name ?? "", branch: br?.name ?? "",
    customer: c?.name ?? undefined,
    business: { name: biz?.name ?? "", phone: biz?.phone ?? undefined, tin: biz?.tin ?? undefined, address: biz?.address ?? undefined, footer: String(settings.receipt_footer ?? "") },
    items: items.map((i) => ({ name: i.name_snapshot, quantity: n(i.quantity), unitPrice: n(i.unit_price), discount: n(i.discount) })),
    subtotal: n(s.subtotal), discountTotal: n(s.discount_total), taxTotal: n(s.tax_total), total: n(s.total),
    payments: pays.map((p) => ({ method: p.method, amount: n(p.amount), reference: p.provider_reference ?? undefined })),
    change: n(s.change_due), status: s.status,
  };
}

async function withLines(db: Db, rows: Row[]) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const items = await db.all(`SELECT * FROM sale_items WHERE sale_id IN (${inList(ids)})`, ids);
  const pays = await db.all(`SELECT * FROM payments WHERE sale_id IN (${inList(ids)}) ORDER BY created_at`, ids);
  return rows.map((s) => mapSale(s, items.filter((i) => i.sale_id === s.id), pays.filter((p) => p.sale_id === s.id)));
}

export async function listSales(db: Db, actor: Actor, branchId: string) {
  requireBranch(actor, branchId);
  const all = actor.perms.has("sales.view_all");
  const rows = await db.all(`SELECT * FROM sales WHERE organization_id = ? AND branch_id = ? ${all ? "" : "AND cashier_id = ?"} ORDER BY created_at DESC LIMIT 300`,
    all ? [actor.orgId, branchId] : [actor.orgId, branchId, actor.memberId]);
  return withLines(db, rows);
}

export async function getSale(db: Db, actor: Actor, id: string) {
  const s = await one(db, "SELECT * FROM sales WHERE id = ? AND organization_id = ?", [id, actor.orgId]);
  if (!s || !canSeeSale(actor, s)) throw notFound("Sale not found.");
  return (await withLines(db, [s]))[0]!;
}

export async function saleRefunds(db: Db, actor: Actor, id: string) {
  const s = await one(db, "SELECT * FROM sales WHERE id = ? AND organization_id = ?", [id, actor.orgId]);
  if (!s || !canSeeSale(actor, s)) return [];
  const rows = await db.all("SELECT r.*, m.full_name AS actor_name FROM refunds r LEFT JOIN business_members m ON m.id = r.actor_id WHERE r.original_sale_id = ? ORDER BY r.created_at", [id]);
  return rows.map((r) => ({ id: r.id, amount: n(r.amount), reason: r.reason, method: r.method, status: r.status, restocked: bool(r.restocked), actorName: r.actor_name ?? "", createdAt: iso(r.created_at) }));
}
