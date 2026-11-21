/**
 * Manager approval on the till: a manager enters their PIN on the cashier's device and the server issues a
 * single-use approval (valid 15 minutes) that the protected action then consumes.
 */
import { audit } from "../../core/activity-log.js";
import { one, type Db } from "../../core/db.js";
import { AppError, bad, forbidden } from "../../core/errors.js";
import { addMinutes, nowSql } from "../../core/time.js";
import { bool, n, uuid } from "../../core/values.js";
import { memberCan, memberHasBranch, requireBranch, type Actor } from "../../auth/access.js";
import { checkPin } from "../tills/pins.service.js";

export async function approvers(db: Db, actor: Actor, branchId: string, perm = "pos.approve") {
  requireBranch(actor, branchId);
  const rows = await db.all(
    `SELECT m.*, r.name AS role_name FROM business_members m JOIN roles r ON r.id = m.role_id
     WHERE m.organization_id = ? AND m.status = 'active' AND m.pin_hash IS NOT NULL AND m.id <> ? ORDER BY m.display_name`, [actor.orgId, actor.memberId]);
  const out = [];
  for (const m of rows) {
    if (!(await memberHasBranch(db, m.id, branchId)) || !(await memberCan(db, m.id, perm))) continue;
    out.push({ id: m.id, fullName: m.full_name, displayName: m.display_name, avatarColor: m.avatar_color, roleName: m.role_name });
  }
  return out;
}

/** A manager approves on the requester's device with their PIN. Returns a single-use approval id (15 min). */
export async function approveAction(db: Db, actor: Actor, i: { terminalId?: string | null; approverId: string; pin: string; action: string; amount?: number | null; detail?: string | null }) {
  if (i.approverId === actor.memberId) throw bad("self_approval_not_allowed", "You can't approve your own request.");
  const terminalId = i.terminalId ?? actor.terminalId;
  let branchId: string | null = null;
  if (terminalId) {
    const t = await one(db, "SELECT branch_id FROM pos_terminals WHERE id = ? AND organization_id = ? AND status = 'active'", [terminalId, actor.orgId]);
    if (!t) throw bad("unknown_terminal", "This till isn't registered or was revoked.");
    branchId = t.branch_id as string;
    requireBranch(actor, branchId);
  }
  const ap = await one(db, "SELECT * FROM business_members WHERE id = ? AND organization_id = ? AND status = 'active'", [i.approverId, actor.orgId]);
  if (!ap || !(await memberCan(db, ap.id, "pos.approve"))) throw forbidden("approver_not_allowed", "That person can't approve this.");
  if (branchId && !(await memberHasBranch(db, ap.id, branchId))) throw forbidden("approver_not_allowed", "That manager doesn't work at this branch.");
  if (i.action === "refund" && !bool(ap.is_owner)) {
    const role = await one(db, "SELECT * FROM roles WHERE id = ?", [ap.role_id]);
    if (!(await memberCan(db, ap.id, "sales.refund")) || n(i.amount) > n(role?.max_refund_amount))
      throw forbidden("approver_limit_exceeded", "That amount is above the approver's limit.");
  }
  const r = await checkPin(db, ap.id, i.pin);
  if (r.result !== "ok") {
    const msg = { wrong: "Wrong PIN.", locked: "That PIN is locked after too many attempts.", no_pin: "That manager hasn't set a PIN yet." }[r.result];
    throw new AppError(r.result === "wrong" ? 401 : 400, `approval_pin_${r.result}`, msg + (r.attemptsLeft != null ? ` ${r.attemptsLeft} attempt${r.attemptsLeft === 1 ? "" : "s"} left.` : ""));
  }
  const id = uuid();
  await db.run("INSERT INTO approvals (id, organization_id, terminal_id, action, amount, detail, requested_by, approved_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    [id, actor.orgId, terminalId ?? null, i.action, i.amount ?? null, i.detail ?? null, actor.memberId, ap.id, nowSql()]);
  await audit(db, { orgId: actor.orgId, actorId: ap.id }, "approval", `Approved ${i.action.replace(/_/g, " ")}`,
    `${i.detail ?? ""} — requested by ${actor.member.full_name}`, { amount: i.amount ?? null, terminalId: terminalId ?? null, entityType: "approval", entityId: id });
  return { approvalId: id };
}

/** Validates and uses up an approval inside the caller's transaction. Returns the approver id. */
export async function consumeApproval(db: Db, actor: Actor, approvalId: string | null | undefined, action: string, amount: number | null, ref: string | null) {
  const label = action.replace(/_/g, " ");
  const deny = () => new AppError(403, "approval_required", `A manager needs to approve this (${label}).`, { action });
  if (!approvalId) throw deny();
  const ap = await one(db, "SELECT * FROM approvals WHERE id = ? FOR UPDATE", [approvalId]);
  if (!ap || ap.organization_id !== actor.orgId || ap.action !== action || ap.used_at || ap.created_at < addMinutes(-15) || ap.requested_by !== actor.memberId
    || (ap.terminal_id && actor.terminalId && ap.terminal_id !== actor.terminalId)
    || (amount != null && n(ap.amount) + 0.005 < Math.abs(amount))) throw deny();
  await db.run("UPDATE approvals SET used_at = ?, used_ref = ? WHERE id = ?", [nowSql(), ref, approvalId]);
  return ap.approved_by as string;
}
