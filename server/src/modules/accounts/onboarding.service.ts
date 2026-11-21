/** First run: a newly signed-up owner creates their business, main branch and default roles. */
import { audit } from "../../core/activity-log.js";
import { one, type Db } from "../../core/db.js";
import { bad, forbidden } from "../../core/errors.js";
import { nowSql, today } from "../../core/time.js";
import { DEFAULT_SETTINGS } from "../../core/settings.js";
import { clean, nullIfEmpty, uuid } from "../../core/values.js";
import { DEFAULT_ROLES, seedReferenceData } from "../../auth/permission-catalogue.js";
import type { SessionInfo } from "../../auth/sessions.js";

/** First run: the signed-up user creates their business, default branch and roles. */
export async function createBusiness(db: Db, s: SessionInfo, p: Record<string, unknown>) {
  if (s.method !== "password") throw forbidden("password_required", "Sign in with your password to do this.");
  const name = clean(p.name);
  if (!name) throw bad("name_required", "Enter the business name.");
  return db.tx(async (tx) => {
    const existing = await one(tx, "SELECT id FROM business_members WHERE user_id = ? AND status <> 'deactivated'", [s.userId]);
    if (existing) throw bad("already_in_business", "You already belong to a business.");
    await seedReferenceData(tx);
    const u = (await one(tx, "SELECT * FROM users WHERE id = ?", [s.userId]))!;
    const ownerName = clean(p.owner_name) || u.full_name;
    const orgId = uuid();
    const now = nowSql();
    const settings = { ...DEFAULT_SETTINGS, ...(typeof p.settings === "object" && p.settings ? p.settings as object : {}) };
    await tx.run(`INSERT INTO businesses (id, name, category, phone, email, address, tin, registration_no, currency, timezone, settings, owner_user_id, plan_id, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [orgId, name, nullIfEmpty(p.category), nullIfEmpty(p.phone), nullIfEmpty(p.email) ?? u.email, nullIfEmpty(p.address), nullIfEmpty(p.tin), nullIfEmpty(p.registration_no),
        clean(p.currency) || "GHS", clean(p.timezone) || "Africa/Accra", JSON.stringify(settings), s.userId, "business", now, now]);
    const branchId = uuid();
    await tx.run("INSERT INTO branches (id, organization_id, name, code, address, phone, status, is_default, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      [branchId, orgId, clean(p.branch_name) || "Main branch", (clean(p.branch_code) || "MAIN").toUpperCase().slice(0, 8), nullIfEmpty(p.branch_address) ?? nullIfEmpty(p.address),
        nullIfEmpty(p.branch_phone) ?? nullIfEmpty(p.phone), "active", true, now]);
    let ownerRole = "";
    for (const r of DEFAULT_ROLES) {
      const rid = uuid();
      if (r.key === "owner") ownerRole = rid;
      await tx.run("INSERT INTO roles (id, organization_id, role_key, name, description, is_system, max_discount_percent, max_refund_amount, allow_no_sale, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [rid, orgId, r.key, r.name, r.description, true, r.discount, r.refund, r.noSale, now]);
      for (const k of r.perms) await tx.run("INSERT INTO role_permissions (role_id, perm_key) VALUES (?,?)", [rid, k]);
    }
    const memberId = uuid();
    await tx.run(`INSERT INTO business_members (id, organization_id, user_id, role_id, full_name, display_name, email, phone, employee_code, status, is_owner, hire_date, avatar_color, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [memberId, orgId, s.userId, ownerRole, ownerName, ownerName.split(" ")[0], u.email, nullIfEmpty(p.owner_phone) ?? u.phone, "FTX-001", "active", true, today(), "bg-brand-600", now]);
    await tx.run("INSERT INTO member_branch_access (member_id, branch_id) VALUES (?,?)", [memberId, branchId]);
    await tx.run("UPDATE sessions SET member_id = ?, organization_id = ? WHERE id = ?", [memberId, orgId, s.id]);
    await audit(tx, { orgId, actorId: memberId }, "settings", "Created business", name, { branchId });
    return { organizationId: orgId };
  });
}
