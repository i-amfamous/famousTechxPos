/**
 * Dashboard & reports - every figure is derived from recorded data.
 * Revenue = sale totals − tax (when prices include tax) − refunds. Voided sales are excluded.
 * Expenses are reported separately and never subtracted from sales.
 */
import { inList, one, type Db, type Row } from "../../core/db.js";
import { forbidden } from "../../core/errors.js";
import { cents, money } from "../../core/money.js";
import { getSettings } from "../../core/settings.js";
import { iso, sqlFromIso } from "../../core/time.js";
import { n } from "../../core/values.js";
import type { Actor } from "../../auth/access.js";
import { dayKey, days, parseRange, timezone } from "./report-range.js";

function scopeCheck(actor: Actor, branchId: string | null) {
  if (branchId ? !actor.branchIds.has(branchId) : !actor.perms.has("reports.view")) throw forbidden("permission_denied", "You don't have permission to see these figures.");
}

const netOf = (s: Row, incl: boolean) => cents(s.total) - (incl ? cents(s.tax_total) : 0) - cents(s.refunded_total);

export async function dashboard(db: Db, actor: Actor, q: { branchId?: string | null; from?: string; to?: string }) {
  const r = parseRange(q);
  scopeCheck(actor, r.branchId);
  // People without reports / all-sales access only see their own figures.
  const all = actor.perms.has("reports.view") || actor.perms.has("sales.view_all");
  const st = await getSettings(db, actor.orgId);
  const incl = st.prices_include_tax !== false;
  const tz = await timezone(db, actor.orgId);
  const len = Date.parse(r.to) - Date.parse(r.from);
  const prevFrom = new Date(Date.parse(r.from) - len).toISOString();

  const where = ["organization_id = ?", "status <> 'voided'", "created_at >= ?", "created_at < ?"];
  const params: (string | null)[] = [actor.orgId, sqlFromIso(prevFrom), sqlFromIso(r.to)];
  if (r.branchId) { where.push("branch_id = ?"); params.push(r.branchId); }
  if (!all) { where.push("cashier_id = ?"); params.push(actor.memberId); }
  const rows = await db.all(`SELECT id, total, tax_total, refunded_total, cost_total, change_due, created_at FROM sales WHERE ${where.join(" AND ")}`, params);
  const fromSql = sqlFromIso(r.from);
  const cur = rows.filter((s) => s.created_at >= fromSql);
  const prev = rows.filter((s) => s.created_at < fromSql);

  const ids = cur.map((s) => s.id);
  const byMethod = ids.length ? await db.all(`SELECT method, SUM(amount) AS amt FROM payments WHERE sale_id IN (${inList(ids)}) GROUP BY method`, ids) : [];
  const top = ids.length ? await db.all(`SELECT product_id, MAX(name_snapshot) AS name, SUM(quantity - refunded_quantity) AS quantity,
      SUM(CASE WHEN quantity > 0 THEN line_total * (quantity - refunded_quantity) / quantity ELSE 0 END) AS revenue
    FROM sale_items WHERE sale_id IN (${inList(ids)}) GROUP BY product_id ORDER BY revenue DESC LIMIT 5`, ids) : [];

  const canSeeExpenses = actor.perms.has("expenses.manage") || actor.perms.has("reports.view");
  const key = dayKey(tz);
  const fromDay = key(new Date(r.from)), toDay = key(new Date(Date.parse(r.to) - 1000));
  const exp = canSeeExpenses
    ? await one(db, `SELECT COALESCE(SUM(amount), 0) AS amt, COUNT(*) AS c FROM expenses WHERE organization_id = ? AND status = 'recorded' AND expense_date >= ? AND expense_date <= ? ${r.branchId ? "AND branch_id = ?" : ""}`,
      r.branchId ? [actor.orgId, fromDay, toDay, r.branchId] : [actor.orgId, fromDay, toDay])
    : { amt: 0, c: 0 };

  // Trend (last 30 days of the range at most)
  const trendFrom = new Date(Math.max(Date.parse(r.from), Date.parse(r.to) - 30 * 864e5)).toISOString();
  const buckets = new Map(days(trendFrom, r.to, tz).map((d) => [d, 0]));
  for (const s of cur) {
    const k = key(new Date(iso(s.created_at)!));
    if (buckets.has(k)) buckets.set(k, buckets.get(k)! + cents(s.total) - cents(s.refunded_total));
  }

  const shifts = await db.all(`SELECT sh.id, sh.member_id, sh.opened_at, m.full_name, m.avatar_color, t.name AS terminal FROM shifts sh
    JOIN business_members m ON m.id = sh.member_id JOIN pos_terminals t ON t.id = sh.terminal_id
    WHERE sh.organization_id = ? AND sh.status = 'open' ${r.branchId ? "AND sh.branch_id = ?" : ""}`, r.branchId ? [actor.orgId, r.branchId] : [actor.orgId]);
  const onShift = [];
  for (const sh of shifts) {
    const f = await one(db, "SELECT COUNT(*) AS c, COALESCE(SUM(total), 0) AS t FROM sales WHERE shift_id = ? AND status <> 'voided'", [sh.id]);
    onShift.push({ shiftId: sh.id, memberId: sh.member_id, fullName: sh.full_name, avatarColor: sh.avatar_color, terminal: sh.terminal, openedAt: iso(sh.opened_at), salesTotal: n(f?.t), salesCount: n(f?.c) });
  }

  const stock = await db.all(`SELECT p.id, p.name, p.reorder_level, COALESCE(SUM(i.quantity), 0) AS quantity FROM products p
    LEFT JOIN inventory i ON i.product_id = p.id ${r.branchId ? "AND i.branch_id = ?" : ""}
    WHERE p.organization_id = ? AND p.status = 'active' AND p.unit <> 'job' GROUP BY p.id, p.name, p.reorder_level`, r.branchId ? [r.branchId, actor.orgId] : [actor.orgId]);
  const lowStock = stock.filter((s) => n(s.quantity) <= n(s.reorder_level)).sort((x, y) => n(x.quantity) - n(y.quantity)).slice(0, 8)
    .map((s) => ({ id: s.id, name: s.name, quantity: n(s.quantity), reorderLevel: n(s.reorder_level) }));

  const sum = (xs: Row[], f: (s: Row) => number) => money(xs.reduce((acc, s) => acc + f(s), 0));
  const changeGiven = sum(cur, (s) => cents(s.change_due));
  return {
    revenue: sum(cur, (s) => netOf(s, incl)), prevRevenue: sum(prev, (s) => netOf(s, incl)),
    salesCount: cur.length, prevSalesCount: prev.length,
    grossProfit: sum(cur, (s) => cents(s.total) - cents(s.tax_total) - cents(s.cost_total) - cents(s.refunded_total)),
    expenses: n(exp?.amt), expenseCount: n(exp?.c), changeGiven,
    // Cash shown net of change handed back.
    byMethod: byMethod.map((m) => ({ method: m.method, amount: money(cents(m.amt) - (m.method === "cash" ? cents(changeGiven) : 0)) })).sort((x, y) => y.amount - x.amount),
    topProducts: top.map((t) => ({ productId: t.product_id, name: t.name, quantity: n(t.quantity), revenue: n(t.revenue) })),
    trend: [...buckets].map(([day, v]) => ({ day, value: money(v) })),
    onShift, lowStock,
  };
}

export async function employeeReport(db: Db, actor: Actor, q: { branchId?: string | null; from?: string; to?: string }) {
  if (!(actor.perms.has("reports.view") || actor.perms.has("employees.view"))) throw forbidden("permission_denied", "You don't have permission to see these figures.");
  const r = parseRange(q);
  if (r.branchId && !actor.branchIds.has(r.branchId)) throw forbidden("permission_denied", "You don't have access to this branch.");
  const f = sqlFromIso(r.from), t = sqlFromIso(r.to);
  const members = await db.all("SELECT id, full_name, avatar_color FROM business_members WHERE organization_id = ? AND status <> 'deactivated'", [actor.orgId]);
  const sales = await db.all(`SELECT cashier_id, COUNT(*) AS c, COALESCE(SUM(total - refunded_total), 0) AS rev, COALESCE(AVG(total), 0) AS avg, COALESCE(SUM(discount_total), 0) AS disc
    FROM sales WHERE organization_id = ? AND status <> 'voided' AND created_at >= ? AND created_at < ? ${r.branchId ? "AND branch_id = ?" : ""} GROUP BY cashier_id`,
    r.branchId ? [actor.orgId, f, t, r.branchId] : [actor.orgId, f, t]);
  const refunds = await db.all("SELECT actor_id, COALESCE(SUM(amount), 0) AS v FROM refunds WHERE organization_id = ? AND created_at >= ? AND created_at < ? GROUP BY actor_id", [actor.orgId, f, t]);
  const approvals = await db.all("SELECT approved_by, COUNT(*) AS c FROM approvals WHERE organization_id = ? AND created_at >= ? AND created_at < ? GROUP BY approved_by", [actor.orgId, f, t]);
  const shifts = await db.all("SELECT member_id, COUNT(*) AS c, COALESCE(SUM(variance), 0) AS v FROM shifts WHERE organization_id = ? AND status = 'closed' AND closed_at >= ? AND closed_at < ? GROUP BY member_id", [actor.orgId, f, t]);
  return members.map((m) => {
    const s = sales.find((x) => x.cashier_id === m.id);
    const sh = shifts.find((x) => x.member_id === m.id);
    return { memberId: m.id, fullName: m.full_name, avatarColor: m.avatar_color, salesCount: n(s?.c), revenue: n(s?.rev), avgSale: money(cents(s?.avg)), discounts: n(s?.disc),
      refunds: n(refunds.find((x) => x.actor_id === m.id)?.v), approvalsGiven: n(approvals.find((x) => x.approved_by === m.id)?.c), cashVariance: n(sh?.v), shifts: n(sh?.c) };
  }).sort((x, y) => y.revenue - x.revenue);
}

export async function employeePerformance(db: Db, actor: Actor, memberId: string, q: { from?: string; to?: string }) {
  const m = await one(db, "SELECT id FROM business_members WHERE id = ? AND organization_id = ?", [memberId, actor.orgId]);
  if (!m || !(actor.perms.has("employees.view") || memberId === actor.memberId)) throw forbidden("permission_denied", "You don't have permission to see these figures.");
  const r = parseRange(q);
  const tz = await timezone(db, actor.orgId);
  const key = dayKey(tz);
  const rows = await db.all("SELECT total, refunded_total, discount_total, created_at FROM sales WHERE cashier_id = ? AND status <> 'voided' AND created_at >= ? AND created_at < ?",
    [memberId, sqlFromIso(r.from), sqlFromIso(r.to)]);
  const appr = await one(db, "SELECT COUNT(*) AS c FROM approvals WHERE requested_by = ? AND action = 'discount' AND created_at >= ? AND created_at < ?", [memberId, sqlFromIso(r.from), sqlFromIso(r.to)]);
  const buckets = new Map(days(r.from, r.to, tz).map((d) => [d, 0]));
  for (const s of rows) { const k = key(new Date(iso(s.created_at)!)); if (buckets.has(k)) buckets.set(k, buckets.get(k)! + cents(s.total) - cents(s.refunded_total)); }
  const shifts = await db.all("SELECT id, closed_at, variance FROM shifts WHERE member_id = ? AND status = 'closed' ORDER BY closed_at DESC LIMIT 8", [memberId]);
  const revenue = rows.reduce((acc, s) => acc + cents(s.total) - cents(s.refunded_total), 0);
  return {
    revenue: money(revenue), salesCount: rows.length, avgSale: rows.length ? money(rows.reduce((acc, s) => acc + cents(s.total), 0) / rows.length) : 0,
    discounts: money(rows.reduce((acc, s) => acc + cents(s.discount_total), 0)), discountsApproved: n(appr?.c),
    trend: [...buckets].map(([day, v]) => ({ day, value: money(v) })),
    shifts: shifts.map((s) => ({ id: s.id, closedAt: iso(s.closed_at), variance: n(s.variance) })),
  };
}

export async function pnl(db: Db, actor: Actor, q: { branchId?: string | null; from?: string; to?: string }) {
  if (!actor.perms.has("reports.view")) throw forbidden("permission_denied", "You don't have permission to see these figures.");
  const r = parseRange(q);
  scopeCheck(actor, r.branchId);
  const incl = (await getSettings(db, actor.orgId)).prices_include_tax !== false;
  const tz = await timezone(db, actor.orgId);
  const key = dayKey(tz);
  const s = await one(db, `SELECT COUNT(*) AS c, COALESCE(SUM(subtotal), 0) AS gross, COALESCE(SUM(discount_total), 0) AS disc, COALESCE(SUM(refunded_total), 0) AS ref,
      COALESCE(SUM(tax_total), 0) AS tax, COALESCE(SUM(total), 0) AS total, COALESCE(SUM(cost_total), 0) AS cost
    FROM sales WHERE organization_id = ? AND status <> 'voided' AND created_at >= ? AND created_at < ? ${r.branchId ? "AND branch_id = ?" : ""}`,
    r.branchId ? [actor.orgId, sqlFromIso(r.from), sqlFromIso(r.to), r.branchId] : [actor.orgId, sqlFromIso(r.from), sqlFromIso(r.to)]);
  const exp = await one(db, `SELECT COALESCE(SUM(amount), 0) AS v FROM expenses WHERE organization_id = ? AND status = 'recorded' AND expense_date >= ? AND expense_date <= ? ${r.branchId ? "AND branch_id = ?" : ""}`,
    r.branchId ? [actor.orgId, key(new Date(r.from)), key(new Date(Date.parse(r.to) - 1000)), r.branchId] : [actor.orgId, key(new Date(r.from)), key(new Date(Date.parse(r.to) - 1000))]);
  const net = cents(s?.total) - cents(s?.ref) - (incl ? cents(s?.tax) : 0);
  return {
    grossSales: n(s?.gross), discounts: n(s?.disc), refunds: n(s?.ref), taxCollected: n(s?.tax), netRevenue: money(net), cogs: n(s?.cost),
    grossProfit: money(net - cents(s?.cost)), operatingExpenses: n(exp?.v), salesCount: n(s?.c),
  };
}
