/**
 * Account controls managers use on employees: suspend/deactivate, sign out everywhere, password resets,
 * invites and ownership transfer.
 */
import { audit } from "../../core/activity-log.js";
import { one, type Db } from "../../core/db.js";
import { bad, forbidden } from "../../core/errors.js";
import { sendMail } from "../../core/mail.js";
import { nowSql } from "../../core/time.js";
import { bool, clean } from "../../core/values.js";
import { requirePassword, requirePerm, type Actor } from "../../auth/access.js";
import { hashSecret, randomPassword } from "../../auth/crypto.js";
import { issueLinkToken } from "../../auth/link-tokens.js";
import { revokeUserSessions } from "../../auth/sessions.js";
import { memberInOrg } from "./employees.service.js";

export async function setMemberStatus(db: Db, actor: Actor, memberId: string, i: { status: string; reason?: string | null }) {
  requirePerm(actor, "employees.manage", { password: true });
  const m = await memberInOrg(db, actor, memberId);
  if (bool(m.is_owner)) throw forbidden("owner_cannot_be_changed", "The owner's account can't be changed by others.");
  if (memberId === actor.memberId) throw bad("cannot_change_own_status", "You can't change your own status.");
  if (!["active", "suspended", "deactivated"].includes(i.status)) throw bad("invalid_status", "Unknown status.");
  if (i.status !== "active" && !clean(i.reason)) throw bad("reason_required", "Please give a reason.");
  await db.run("UPDATE business_members SET status = ?, deactivated_at = ? WHERE id = ?", [i.status, i.status === "deactivated" ? nowSql() : null, memberId]);
  if (i.status !== "active") await revokeUserSessions(db, m.user_id); // instant sign-out everywhere
  const action = { active: "Reactivated employee", suspended: "Suspended employee", deactivated: "Deactivated employee" }[i.status]!;
  await audit(db, { orgId: actor.orgId, actorId: actor.memberId }, "employee", action, `${m.full_name}${clean(i.reason) ? ` — ${clean(i.reason)}` : ""}`, { entityType: "member", entityId: memberId });
}

export async function forceSignOut(db: Db, actor: Actor, memberId: string) {
  requirePerm(actor, "employees.manage", { password: true });
  const m = await memberInOrg(db, actor, memberId);
  if (bool(m.is_owner) && !actor.isOwner) throw forbidden("owner_cannot_be_changed", "The owner's account can't be changed by others.");
  await revokeUserSessions(db, m.user_id, m.user_id === actor.userId ? actor.sessionId : undefined);
  await audit(db, { orgId: actor.orgId, actorId: actor.memberId }, "employee", "Signed out everywhere", m.full_name, { entityType: "member", entityId: memberId });
}

/** Emails a reset link when the employee has an email; otherwise sets a temporary password to hand over. */
export async function resetEmployeePassword(db: Db, actor: Actor, memberId: string) {
  requirePerm(actor, "employees.manage", { password: true });
  const m = await memberInOrg(db, actor, memberId);
  if (bool(m.is_owner)) throw forbidden("owner_cannot_be_changed", "The owner's account can't be changed by others.");
  const u = await one(db, "SELECT * FROM users WHERE id = ?", [m.user_id]);
  await revokeUserSessions(db, m.user_id);
  await audit(db, { orgId: actor.orgId, actorId: actor.memberId }, "employee", "Reset password", m.full_name, { entityType: "member", entityId: memberId });
  if (u?.email) {
    const link = await issueLinkToken(db, m.user_id, "reset", m.id);
    const ok = await sendMail(u.email, "Reset your Famous TechX POS password", `Hi ${m.full_name},\n\nA manager reset your password. Open this link within 1 hour to choose a new one:\n\n${link}\n`);
    if (ok) return { ok: true, emailed: u.email as string };
  }
  const temp = randomPassword();
  await db.run("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?", [await hashSecret(temp), m.user_id]);
  return { ok: true, tempPassword: temp };
}

export async function resendInvite(db: Db, actor: Actor, memberId: string) {
  requirePerm(actor, "employees.manage", { password: true });
  const m = await memberInOrg(db, actor, memberId);
  const u = await one(db, "SELECT * FROM users WHERE id = ?", [m.user_id]);
  if (!u?.email) throw bad("no_email", "This employee has no email address. Use 'Reset password' to give them a temporary one.");
  const link = await issueLinkToken(db, m.user_id, m.status === "invited" ? "invite" : "reset", m.id);
  const biz = await one(db, "SELECT name FROM businesses WHERE id = ?", [actor.orgId]);
  const ok = await sendMail(u.email, `Your invitation to ${biz?.name} on Famous TechX POS`, `Hi ${m.full_name},\n\nOpen this link to set your password and get started:\n\n${link}\n`);
  return { ok: true, emailed: ok ? (u.email as string) : undefined, inviteLink: ok ? undefined : link };
}

export async function transferOwnership(db: Db, actor: Actor, memberId: string) {
  if (!actor.isOwner) throw forbidden("owner_only", "Only the owner can do this.");
  requirePassword(actor);
  const m = await memberInOrg(db, actor, memberId);
  if (m.status !== "active") throw bad("member_not_active", "Choose an active employee.");
  if (memberId === actor.memberId) return;
  await db.tx(async (tx) => {
    const ownerRole = await one(tx, "SELECT id FROM roles WHERE organization_id = ? AND role_key = 'owner'", [actor.orgId]);
    const adminRole = await one(tx, "SELECT id FROM roles WHERE organization_id = ? AND role_key = 'admin'", [actor.orgId]);
    await tx.run("UPDATE business_members SET is_owner = 0, role_id = ? WHERE id = ?", [adminRole!.id, actor.memberId]);
    await tx.run("UPDATE business_members SET is_owner = 1, role_id = ? WHERE id = ?", [ownerRole!.id, memberId]);
    await tx.run("UPDATE businesses SET owner_user_id = ?, updated_at = ? WHERE id = ?", [m.user_id, nowSql(), actor.orgId]);
    await audit(tx, { orgId: actor.orgId, actorId: actor.memberId }, "employee", "Transferred ownership", m.full_name, { entityType: "member", entityId: memberId });
  });
}
