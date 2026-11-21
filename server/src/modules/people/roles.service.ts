/** Roles: permission sets with discount, refund and no-sale limits. */
import { audit } from "../../core/activity-log.js";
import { inList, one, type Db, type Row } from "../../core/db.js";
import { bad, notFound } from "../../core/errors.js";
import { nowSql } from "../../core/time.js";
import { bool, clean, n, uuid } from "../../core/values.js";
import { requirePerm, type Actor } from "../../auth/access.js";
import { randomToken } from "../../auth/crypto.js";
import { ALL_PERMS, PERMISSIONS } from "../../auth/permission-catalogue.js";

export const mapRole = (r: Row, permissions: string[], memberCount: number) => ({
  id: r.id, key: r.role_key, name: r.name, description: r.description ?? "", isSystem: bool(r.is_system), memberCount,
  limits: { maxDiscountPercent: n(r.max_discount_percent), maxRefundAmount: n(r.max_refund_amount), allowNoSale: bool(r.allow_no_sale) },
  permissions,
});

export function listPermissions() {
  return PERMISSIONS.map(([key, label, module, sensitive]) => ({ key, label, module, sensitive }));
}

export async function listRoles(db: Db, actor: Actor) {
  const roles = await db.all("SELECT * FROM roles WHERE organization_id = ? ORDER BY created_at", [actor.orgId]);
  const ids = roles.map((r) => r.id);
  const perms = ids.length ? await db.all(`SELECT role_id, perm_key FROM role_permissions WHERE role_id IN (${inList(ids)})`, ids) : [];
  const counts = await db.all("SELECT role_id, COUNT(*) AS c FROM business_members WHERE organization_id = ? AND status <> 'deactivated' GROUP BY role_id", [actor.orgId]);
  return roles.map((r) => mapRole(r, perms.filter((p) => p.role_id === r.id).map((p) => p.perm_key), n(counts.find((c) => c.role_id === r.id)?.c)));
}

export async function saveRole(db: Db, actor: Actor, p: { id?: string | null; name: string; description?: string; maxDiscountPercent?: number; maxRefundAmount?: number; allowNoSale?: boolean; permissions?: string[] }) {
  requirePerm(actor, "roles.manage", { password: true });
  const name = clean(p.name);
  if (!name) throw bad("name_required", "Enter a role name.");
  const perms = [...new Set((p.permissions ?? []).filter((k) => ALL_PERMS.includes(k)))];
  const vals = [name, clean(p.description), Math.min(100, Math.max(0, n(p.maxDiscountPercent))), Math.max(0, n(p.maxRefundAmount)), !!p.allowNoSale];
  return db.tx(async (tx) => {
    let id = p.id && p.id !== "new" ? p.id : null;
    if (id) {
      const r = await one(tx, "SELECT * FROM roles WHERE id = ? AND organization_id = ?", [id, actor.orgId]);
      if (!r) throw notFound("Role not found.");
      if (r.role_key === "owner") throw bad("owner_role_locked", "The Owner role always has every permission.");
      await tx.run("UPDATE roles SET name = ?, description = ?, max_discount_percent = ?, max_refund_amount = ?, allow_no_sale = ? WHERE id = ?", [...vals, id]);
    } else {
      id = uuid();
      await tx.run("INSERT INTO roles (id, organization_id, role_key, name, description, is_system, max_discount_percent, max_refund_amount, allow_no_sale, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [id, actor.orgId, `custom_${randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, "x")}`, vals[0], vals[1], false, vals[2], vals[3], vals[4], nowSql()]);
    }
    await tx.run("DELETE FROM role_permissions WHERE role_id = ?", [id]);
    for (const k of perms) await tx.run("INSERT INTO role_permissions (role_id, perm_key) VALUES (?,?)", [id, k]);
    await audit(tx, { orgId: actor.orgId, actorId: actor.memberId }, "employee", "Saved role", name, { entityType: "role", entityId: id, meta: { permissions: perms } });
    return { id };
  });
}

export async function deleteRole(db: Db, actor: Actor, id: string) {
  requirePerm(actor, "roles.manage", { password: true });
  const r = await one(db, "SELECT * FROM roles WHERE id = ? AND organization_id = ?", [id, actor.orgId]);
  if (!r) throw notFound("Role not found.");
  if (bool(r.is_system)) throw bad("system_role_locked", "Default roles can't be deleted.");
  if (await one(db, "SELECT id FROM business_members WHERE role_id = ? LIMIT 1", [id])) throw bad("role_in_use", "Move this role's employees to another role first.");
  await db.run("DELETE FROM role_permissions WHERE role_id = ?", [id]);
  await db.run("DELETE FROM roles WHERE id = ?", [id]);
  await audit(db, { orgId: actor.orgId, actorId: actor.memberId }, "employee", "Deleted role", r.name);
}
