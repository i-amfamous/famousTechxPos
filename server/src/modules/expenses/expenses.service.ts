/** Operating expenses. Never subtracted from sales figures; shown separately in reports. */
import { audit } from "../../core/activity-log.js";
import { one, type Db } from "../../core/db.js";
import { bad } from "../../core/errors.js";
import { cents, money } from "../../core/money.js";
import { nowSql } from "../../core/time.js";
import { clean, n, uuid } from "../../core/values.js";
import { requireAnyPerm, requireBranch, requirePerm, type Actor } from "../../auth/access.js";

export async function listExpenses(db: Db, actor: Actor) {
  requireAnyPerm(actor, ["expenses.manage", "reports.view"]);
  const rows = await db.all("SELECT * FROM expenses WHERE organization_id = ? ORDER BY expense_date DESC, created_at DESC LIMIT 500", [actor.orgId]);
  return rows.map((e) => ({ id: e.id, date: e.expense_date, category: e.category, description: e.description, amount: n(e.amount), method: e.method,
    branchId: e.branch_id, actorId: e.actor_id, status: e.status, hasAttachment: !!e.attachment_url }));
}

export async function saveExpense(db: Db, actor: Actor, e: { amount: number; category: string; date: string; method: string; branchId: string; description: string }) {
  requirePerm(actor, "expenses.manage");
  requireBranch(actor, e.branchId);
  const amount = money(cents(e.amount));
  if (!(amount > 0)) throw bad("amount_required", "Enter an amount.");
  if (!clean(e.description)) throw bad("description_required", "Describe the expense.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean(e.date))) throw bad("invalid_date", "Choose a date.");
  const id = uuid();
  await db.run("INSERT INTO expenses (id, organization_id, branch_id, category, amount, expense_date, description, method, status, actor_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    [id, actor.orgId, e.branchId, clean(e.category) || "Other", amount, clean(e.date), clean(e.description), ["cash", "momo", "card", "bank"].includes(e.method) ? e.method : "cash", "recorded", actor.memberId, nowSql()]);
  await audit(db, { orgId: actor.orgId, actorId: actor.memberId }, "settings", "Recorded expense", clean(e.description), { amount, branchId: e.branchId });
  return { id };
}

export async function voidExpense(db: Db, actor: Actor, id: string, reason: string) {
  requirePerm(actor, "expenses.void");
  if (!clean(reason)) throw bad("reason_required", "Please give a reason.");
  const e = await one(db, "SELECT * FROM expenses WHERE id = ? AND organization_id = ? AND status = 'recorded'", [id, actor.orgId]);
  if (!e) throw bad("not_voidable", "This expense was already voided.");
  await db.run("UPDATE expenses SET status = 'voided', void_reason = ? WHERE id = ?", [clean(reason), id]);
  await audit(db, { orgId: actor.orgId, actorId: actor.memberId }, "settings", "Voided expense", `${e.description} · ${clean(reason)}`, { amount: n(e.amount), branchId: e.branch_id });
}
