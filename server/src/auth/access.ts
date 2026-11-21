/** Access control: who the caller is (Actor), their effective permissions and branches, and guard helpers. */
import { one, type Db, type Row } from "../core/db.js";
import { forbidden } from "../core/errors.js";
import { ALL_PERMS } from "./permission-catalogue.js";

/** The signed-in employee, resolved from the session on every request. */
export interface Actor {
  sessionId: string;
  userId: string;
  orgId: string;
  memberId: string;
  isOwner: boolean;
  roleId: string;
  perms: Set<string>;
  branchIds: Set<string>;
  method: "password" | "pin";
  terminalId: string | null;
  member: Row;
  role: Row;
}

/** Effective permissions for a member (owner ⇒ all; overrides beat the role). */
export async function memberPermissions(db: Db, member: Row): Promise<Set<string>> {
  if (member.is_owner) return new Set(ALL_PERMS);
  const rp = await db.all("SELECT perm_key FROM role_permissions WHERE role_id = ?", [member.role_id]);
  const set = new Set(rp.map((r) => r.perm_key as string));
  const ov = await db.all("SELECT perm_key, effect FROM member_permission_overrides WHERE member_id = ?", [member.id]);
  for (const o of ov) (o.effect === "grant" ? set.add(o.perm_key) : set.delete(o.perm_key));
  return set;
}

export async function memberBranches(db: Db, member: Row): Promise<Set<string>> {
  if (member.is_owner) {
    const all = await db.all("SELECT id FROM branches WHERE organization_id = ?", [member.organization_id]);
    return new Set(all.map((b) => b.id as string));
  }
  const rows = await db.all("SELECT branch_id FROM member_branch_access WHERE member_id = ?", [member.id]);
  return new Set(rows.map((r) => r.branch_id as string));
}

export async function memberCan(db: Db, memberId: string, perm: string): Promise<boolean> {
  const m = await one(db, "SELECT * FROM business_members WHERE id = ? AND status = 'active'", [memberId]);
  return !!m && (await memberPermissions(db, m)).has(perm);
}

export async function memberHasBranch(db: Db, memberId: string, branchId: string): Promise<boolean> {
  const m = await one(db, "SELECT * FROM business_members WHERE id = ?", [memberId]);
  return !!m && (await memberBranches(db, m)).has(branchId);
}

export function requirePerm(actor: Actor, perm: string, opts: { password?: boolean } = {}) {
  if (!actor.perms.has(perm)) throw forbidden("permission_denied", "You don't have permission to do that.");
  if (opts.password && actor.method !== "password") throw forbidden("password_required", "Sign in with your password (not a PIN) to do this.");
}

export function requireAnyPerm(actor: Actor, perms: string[]) {
  if (!perms.some((p) => actor.perms.has(p))) throw forbidden("permission_denied", "You don't have permission to do that.");
}

export function requireBranch(actor: Actor, branchId: string) {
  if (!actor.branchIds.has(branchId)) throw forbidden("branch_not_allowed", "You don't have access to this branch.");
}

export function requirePassword(actor: Actor) {
  if (actor.method !== "password") throw forbidden("password_required", "Sign in with your password (not a PIN) to do this.");
}
