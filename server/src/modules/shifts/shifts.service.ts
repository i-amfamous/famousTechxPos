/** Shifts and the cash drawer: open, cash in/out, expected cash, close with count and variance control. */
import { audit, notify } from "../../core/activity-log.js";
import { inList, one, type Db, type Row } from "../../core/db.js";
import { bad, forbidden, notFound } from "../../core/errors.js";
import { cents, money } from "../../core/money.js";
import { getSettings } from "../../core/settings.js";
import { iso, nowSql } from "../../core/time.js";
import { clean, n, parseJson, uuid } from "../../core/values.js";
import { requireBranch, requirePerm, type Actor } from "../../auth/access.js";
import { consumeApproval } from "../approvals/approvals.service.js";

export const mapMove = (c: Row) => ({ id: c.id, shiftId: c.shift_id, type: c.type, amount: n(c.amount), reason: c.reason, actorId: c.actor_id, createdAt: iso(c.created_at) });

/** Expected cash in the drawer: float + cash taken − change − cash refunds ± cash movements. */
export async function expectedCash(db: Db, shiftId: string): Promise<number> {
  const s = await one(db, "SELECT opening_float FROM shifts WHERE id = ?", [shiftId]);
  if (!s) return 0;
  const cash = await one(db, "SELECT COALESCE(SUM(p.amount), 0) AS v FROM payments p JOIN sales x ON x.id = p.sale_id WHERE x.shift_id = ? AND p.method = 'cash' AND x.status <> 'voided'", [shiftId]);
  const change = await one(db, "SELECT COALESCE(SUM(change_due), 0) AS v FROM sales WHERE shift_id = ? AND status <> 'voided'", [shiftId]);
  const refunds = await one(db, "SELECT COALESCE(SUM(amount), 0) AS v FROM refunds WHERE shift_id = ? AND method = 'cash'", [shiftId]);
  const moves = await one(db, `SELECT COALESCE(SUM(CASE type WHEN 'paid_in' THEN amount WHEN 'paid_out' THEN -amount WHEN 'drop' THEN -amount ELSE 0 END), 0) AS v
    FROM cash_movements WHERE shift_id = ?`, [shiftId]);
  return money(cents(s.opening_float) + cents(cash?.v) - cents(change?.v) - cents(refunds?.v) + cents(moves?.v));
}

/** Sales figures for a set of shifts (one query each, grouped). */
async function shiftFigures(db: Db, ids: string[]) {
  const out = new Map<string, { count: number; total: number; cash: number; momo: number; card: number; bank: number; change: number }>();
  if (!ids.length) return out;
  for (const id of ids) out.set(id, { count: 0, total: 0, cash: 0, momo: 0, card: 0, bank: 0, change: 0 });
  const sales = await db.all(`SELECT shift_id, COUNT(*) AS c, COALESCE(SUM(total), 0) AS t, COALESCE(SUM(change_due), 0) AS ch FROM sales
    WHERE shift_id IN (${inList(ids)}) AND status <> 'voided' GROUP BY shift_id`, ids);
  for (const r of sales) Object.assign(out.get(r.shift_id)!, { count: n(r.c), total: n(r.t), change: n(r.ch) });
  const pays = await db.all(`SELECT x.shift_id, p.method, COALESCE(SUM(p.amount), 0) AS v FROM payments p JOIN sales x ON x.id = p.sale_id
    WHERE x.shift_id IN (${inList(ids)}) AND x.status <> 'voided' GROUP BY x.shift_id, p.method`, ids);
  for (const r of pays) { const f = out.get(r.shift_id)!; (f as Record<string, number>)[r.method] = n(r.v); }
  for (const f of out.values()) f.cash = money(cents(f.cash) - cents(f.change));
  return out;
}

async function mapShifts(db: Db, rows: Row[]) {
  const figs = await shiftFigures(db, rows.map((r) => r.id));
  const out = [];
  for (const s of rows) {
    const f = figs.get(s.id)!;
    out.push({
      id: s.id, employeeId: s.member_id, terminalId: s.terminal_id, branchId: s.branch_id, status: s.status, openedAt: iso(s.opened_at),
      closedAt: iso(s.closed_at) ?? undefined, openingFloat: n(s.opening_float),
      expectedCash: s.expected_cash == null ? await expectedCash(db, s.id) : n(s.expected_cash),
      countedCash: s.counted_cash == null ? undefined : n(s.counted_cash), salesCount: f.count, salesTotal: f.total,
      byMethod: { cash: f.cash, momo: f.momo, card: f.card, bank: f.bank },
      approvedBy: s.approved_by ?? undefined, note: s.note ?? undefined, variance: s.variance == null ? undefined : n(s.variance),
    });
  }
  return out;
}

export async function listShifts(db: Db, actor: Actor, branchId: string) {
  requireBranch(actor, branchId);
  const all = actor.perms.has("shift.view_all");
  const rows = await db.all(`SELECT * FROM shifts WHERE organization_id = ? AND branch_id = ? ${all ? "" : "AND member_id = ?"} ORDER BY opened_at DESC LIMIT 200`,
    all ? [actor.orgId, branchId] : [actor.orgId, branchId, actor.memberId]);
  return mapShifts(db, rows);
}

export async function shiftSummary(db: Db, actor: Actor, shiftId: string) {
  const s = await one(db, "SELECT * FROM shifts WHERE id = ? AND organization_id = ?", [shiftId, actor.orgId]);
  if (!s || (s.member_id !== actor.memberId && !actor.perms.has("shift.view_all"))) throw notFound("Shift not found.");
  requireBranch(actor, s.branch_id);
  const [shift] = await mapShifts(db, [s]);
  const moves = await db.all("SELECT * FROM cash_movements WHERE shift_id = ? ORDER BY created_at", [shiftId]);
  const ref = await one(db, "SELECT COALESCE(SUM(amount), 0) AS v FROM refunds WHERE shift_id = ? AND method = 'cash'", [shiftId]);
  return { shift: shift!, movements: moves.map(mapMove), refundsCash: n(ref?.v) };
}

export async function listCashMovements(db: Db, actor: Actor) {
  requirePerm(actor, "shift.view_all");
  return (await db.all("SELECT * FROM cash_movements WHERE organization_id = ? ORDER BY created_at DESC LIMIT 300", [actor.orgId])).map(mapMove);
}

/** The caller's open shift on a till (or the till's shared drawer). */
export async function myOpenShift(db: Db, actor: Actor, terminalId: string): Promise<string | null> {
  const t = await one(db, "SELECT branch_id FROM pos_terminals WHERE id = ? AND organization_id = ? AND status = 'active'", [terminalId, actor.orgId]);
  if (!t) throw bad("unknown_terminal", "This till isn't registered or was revoked.");
  requireBranch(actor, t.branch_id);
  const shared = (await getSettings(db, actor.orgId)).shared_drawer;
  const s = await one(db, `SELECT id FROM shifts WHERE terminal_id = ? AND organization_id = ? AND status = 'open' ${shared ? "" : "AND member_id = ?"} ORDER BY opened_at DESC LIMIT 1`,
    shared ? [terminalId, actor.orgId] : [terminalId, actor.orgId, actor.memberId]);
  return s?.id ?? null;
}

export async function openShift(db: Db, actor: Actor, i: { terminalId: string; openingFloat: number }) {
  requirePerm(actor, "shift.open_close");
  const t = await one(db, "SELECT * FROM pos_terminals WHERE id = ? AND organization_id = ? AND status = 'active'", [i.terminalId, actor.orgId]);
  if (!t) throw bad("unknown_terminal", "This till isn't registered or was revoked.");
  requireBranch(actor, t.branch_id);
  const float = money(cents(i.openingFloat));
  if (!(float >= 0)) throw bad("invalid_amount", "Enter a valid opening float.");
  return db.tx(async (tx) => {
    const existing = await myOpenShift(tx, actor, t.id);
    if (existing) return { shiftId: existing };
    const id = uuid();
    await tx.run("INSERT INTO shifts (id, organization_id, branch_id, terminal_id, member_id, status, opening_float, opened_at) VALUES (?,?,?,?,?,?,?,?)",
      [id, actor.orgId, t.branch_id, t.id, actor.memberId, "open", float, nowSql()]);
    await audit(tx, { orgId: actor.orgId, actorId: actor.memberId }, "cash", "Opened shift", `${t.name} · float ${float.toFixed(2)}`,
      { amount: float, branchId: t.branch_id, terminalId: t.id, entityType: "shift", entityId: id });
    return { shiftId: id };
  });
}

export async function recordCashMovement(db: Db, actor: Actor, shiftId: string, i: { type: string; amount?: number; reason: string; approvalId?: string | null }) {
  requirePerm(actor, "shift.cash_movement");
  if (!["paid_in", "paid_out", "drop", "no_sale"].includes(i.type)) throw bad("invalid_type", "Unknown cash movement type.");
  if (!clean(i.reason)) throw bad("reason_required", "Please give a reason.");
  const amount = i.type === "no_sale" ? 0 : money(cents(i.amount));
  if (i.type !== "no_sale" && !(amount > 0)) throw bad("amount_required", "Enter an amount.");
  return db.tx(async (tx) => {
    const s = await one(tx, "SELECT * FROM shifts WHERE id = ? AND organization_id = ? AND status = 'open' FOR UPDATE", [shiftId, actor.orgId]);
    if (!s) throw bad("shift_not_open", "This shift is already closed.");
    requireBranch(actor, s.branch_id);
    if (i.type === "no_sale" && !(actor.perms.has("pos.no_sale") || actor.role.allow_no_sale)) await consumeApproval(tx, actor, i.approvalId, "no_sale", null, shiftId);
    if (i.type === "drop" && !actor.perms.has("pos.approve")) await consumeApproval(tx, actor, i.approvalId, "drop", amount, shiftId);
    const id = uuid();
    await tx.run("INSERT INTO cash_movements (id, organization_id, shift_id, type, amount, reason, actor_id, approval_id, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      [id, actor.orgId, shiftId, i.type, amount, clean(i.reason), actor.memberId, i.approvalId ?? null, nowSql()]);
    const label = { paid_in: "Cash in", paid_out: "Cash out", drop: "Cash drop", no_sale: "Opened drawer (no sale)" }[i.type]!;
    await audit(tx, { orgId: actor.orgId, actorId: actor.memberId }, "cash", label, clean(i.reason), { amount, branchId: s.branch_id, terminalId: s.terminal_id, entityType: "shift", entityId: shiftId });
    return { id };
  });
}

/** counts: { "200": 3, "50": 2, "0.5": 4 } - denomination → number of notes/coins. */
export async function closeShift(db: Db, actor: Actor, shiftId: string, i: { counts: Record<string, number>; note?: string | null; approvalId?: string | null }) {
  requirePerm(actor, "shift.open_close");
  return db.tx(async (tx) => {
    const s = await one(tx, "SELECT * FROM shifts WHERE id = ? AND organization_id = ? AND status = 'open' FOR UPDATE", [shiftId, actor.orgId]);
    if (!s) throw bad("shift_not_open", "This shift is already closed.");
    requireBranch(actor, s.branch_id);
    if (s.member_id !== actor.memberId && !actor.perms.has("shift.view_all")) throw forbidden("not_your_shift", "This isn't your shift.");
    let counted = 0;
    for (const [denom, count] of Object.entries(i.counts ?? {})) counted += Math.round(Number(denom) * 100) * Math.max(0, Math.floor(Number(count) || 0));
    const countedM = money(counted);
    const expected = await expectedCash(tx, shiftId);
    const variance = money(counted - cents(expected));
    const st = await getSettings(tx, actor.orgId);
    let approver: string | null = null;
    if (Math.abs(variance) > n(st.variance_threshold)) {
      if (!clean(i.note)) throw bad("note_required", "Explain the cash difference in the note.");
      approver = actor.perms.has("pos.approve") ? actor.memberId : await consumeApproval(tx, actor, i.approvalId, "shift_variance", Math.abs(variance), shiftId);
      const who = await one(tx, "SELECT full_name FROM business_members WHERE id = ?", [s.member_id]);
      await notify(tx, actor.orgId, "shift", "Shift closed with variance", `${who?.full_name}: ${variance.toFixed(2)}`, "shift.view_all");
    }
    await tx.run(`UPDATE shifts SET status = 'closed', closed_at = ?, closed_by = ?, expected_cash = ?, counted_cash = ?, denomination_counts = ?, variance = ?, note = ?, approved_by = ? WHERE id = ?`,
      [nowSql(), actor.memberId, expected, countedM, JSON.stringify(i.counts ?? {}), variance, clean(i.note) || null, approver, shiftId]);
    await audit(tx, { orgId: actor.orgId, actorId: actor.memberId }, "cash", "Closed shift", `Expected ${expected.toFixed(2)} · counted ${countedM.toFixed(2)} · variance ${variance.toFixed(2)}`,
      { amount: variance, branchId: s.branch_id, terminalId: s.terminal_id, entityType: "shift", entityId: shiftId });
    return { expected, counted: countedM, variance, counts: parseJson(JSON.stringify(i.counts ?? {}), {}) };
  });
}
