/** The activity log and sign-in history. */
import type { Db, Row } from "../../core/db.js";
import { iso } from "../../core/time.js";
import { bool, n } from "../../core/values.js";
import { requireAnyPerm, type Actor } from "../../auth/access.js";

export async function listActivity(db: Db, actor: Actor) {
  requireAnyPerm(actor, ["activity.view", "employees.view"]);
  const rows = await db.all("SELECT * FROM audit_logs WHERE organization_id = ? ORDER BY created_at DESC LIMIT 400", [actor.orgId]);
  return rows.map((x: Row) => ({ id: x.id, actorId: x.actor_id ?? "", action: x.action, category: x.category, detail: x.detail, terminalId: x.terminal_id ?? undefined,
    branchId: x.branch_id ?? "", createdAt: iso(x.created_at), amount: x.amount == null ? undefined : n(x.amount) }));
}

export async function listSignIns(db: Db, actor: Actor) {
  requireAnyPerm(actor, ["activity.view", "employees.view"]);
  const rows = await db.all("SELECT * FROM sign_in_events WHERE organization_id = ? ORDER BY created_at DESC LIMIT 300", [actor.orgId]);
  return rows.map((e) => ({ id: e.id, employeeId: e.member_id, method: e.method, success: bool(e.success), device: e.device ?? "Browser", createdAt: iso(e.created_at) }));
}
