/** Branches (shops/locations) within the plan's limit. */
import { audit } from "../../core/activity-log.js";
import { one, type Db, type Row } from "../../core/db.js";
import { bad, notFound } from "../../core/errors.js";
import { nowSql } from "../../core/time.js";
import { bool, clean, n, nullIfEmpty, uuid } from "../../core/values.js";
import { requirePerm, type Actor } from "../../auth/access.js";

export const mapBranch = (b: Row) => ({ id: b.id, name: b.name, code: b.code, address: b.address ?? "", phone: b.phone ?? "", status: b.status, isDefault: bool(b.is_default) });

export async function listBranches(db: Db, actor: Actor) {
  return (await db.all("SELECT * FROM branches WHERE organization_id = ? ORDER BY is_default DESC, name", [actor.orgId])).map(mapBranch);
}

export async function saveBranch(db: Db, actor: Actor, b: { id?: string; name: string; code?: string; address?: string; phone?: string; status?: string }) {
  requirePerm(actor, "branches.manage", { password: true });
  const name = clean(b.name);
  if (!name) throw bad("name_required", "Enter the branch name.");
  const code = (clean(b.code) || name.replace(/[^a-z]/gi, "").slice(0, 3) || "BR").toUpperCase().slice(0, 8);
  const status = b.status === "inactive" ? "inactive" : "active";
  if (b.id) {
    const cur = await one(db, "SELECT * FROM branches WHERE id = ? AND organization_id = ?", [b.id, actor.orgId]);
    if (!cur) throw notFound("Branch not found.");
    if (bool(cur.is_default) && status === "inactive") throw bad("default_branch", "The main branch can't be deactivated.");
    await db.run("UPDATE branches SET name = ?, code = ?, address = ?, phone = ?, status = ? WHERE id = ?", [name, code, nullIfEmpty(b.address), nullIfEmpty(b.phone), status, b.id]);
    await audit(db, { orgId: actor.orgId, actorId: actor.memberId }, "settings", "Updated branch", name, { branchId: b.id });
    return { id: b.id };
  }
  const plan = await one(db, "SELECT p.max_branches FROM businesses x JOIN subscription_plans p ON p.id = x.plan_id WHERE x.id = ?", [actor.orgId]);
  const used = await one(db, "SELECT COUNT(*) AS c FROM branches WHERE organization_id = ? AND status = 'active'", [actor.orgId]);
  if (plan && n(used?.c) >= n(plan.max_branches)) throw bad("branch_limit_reached", "You've reached the number of branches on your plan.");
  const id = uuid();
  await db.run("INSERT INTO branches (id, organization_id, name, code, address, phone, status, is_default, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    [id, actor.orgId, name, code, nullIfEmpty(b.address), nullIfEmpty(b.phone), status, false, nowSql()]);
  // The person who created it can work there straight away.
  if (!actor.isOwner) await db.run("INSERT INTO member_branch_access (member_id, branch_id) VALUES (?,?)", [actor.memberId, id]);
  await audit(db, { orgId: actor.orgId, actorId: actor.memberId }, "settings", "Added branch", name, { branchId: id });
  return { id };
}
