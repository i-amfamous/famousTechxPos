/** The audit trail and in-app notifications. Every sensitive action writes to the audit log. */
import type { Db } from "./db.js";
import { nowSql } from "./time.js";
import { uuid } from "./values.js";

export interface AuditScope { orgId: string; actorId?: string | null }
export interface AuditExtra { amount?: number | null; branchId?: string | null; terminalId?: string | null; entityType?: string; entityId?: string; meta?: unknown }

/** Appends an entry to the business's activity log. */
export async function audit(db: Db, scope: AuditScope, category: string, action: string, detail: string, extra: AuditExtra = {}) {
  await db.run(
    "INSERT INTO audit_logs (id, organization_id, branch_id, terminal_id, actor_id, category, action, detail, amount, entity_type, entity_id, metadata, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [uuid(), scope.orgId, extra.branchId ?? null, extra.terminalId ?? null, scope.actorId ?? null, category, action, (detail ?? "").slice(0, 600), extra.amount ?? null,
      extra.entityType ?? null, extra.entityId ?? null, extra.meta ? JSON.stringify(extra.meta) : null, nowSql()],
  );
}

/** Sends an in-app notification to one member, or to everyone holding `audiencePerm`, or to everyone. */
export async function notify(db: Db, orgId: string, type: string, title: string, body: string, audiencePerm: string | null = null, memberId: string | null = null) {
  await db.run("INSERT INTO notifications (id, organization_id, member_id, audience_perm, type, title, body, read_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    [uuid(), orgId, memberId, audiencePerm, type, title.slice(0, 200), body.slice(0, 600), "[]", nowSql()]);
}
