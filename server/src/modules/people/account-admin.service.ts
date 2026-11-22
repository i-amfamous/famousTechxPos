/**
 * Account controls managers use on employees: suspend/deactivate, sign out everywhere, password resets,
 * invites and ownership transfer.
 */
import { audit } from "../../core/activity-log.js";
import { one, type Db } from "../../core/db.js";
import { bad, forbidden } from "../../core/errors.js";
import { sendBrandedMail } from "../../core/mail.js";
import { nowSql } from "../../core/time.js";
import { bool, clean } from "../../core/values.js";
import { requirePassword, requirePerm, type Actor } from "../../auth/access.js";
import { hashSecret, randomPassword } from "../../auth/crypto.js";
import { issueLinkToken } from "../../auth/link-tokens.js";
import { revokeMemberSessions, revokeUserSessions } from "../../auth/sessions.js";
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
  await audit(db, { orgId: actor.orgId, actorId: actor.memberId }, "employee", action, `${m.full_name}${clean(i.reason) ? ` - ${clean(i.reason)}` : ""}`, { entityType: "member", entityId: memberId });
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
    const biz = await one(db, "SELECT name FROM businesses WHERE id = ?", [actor.orgId]);
    const ok = await sendBrandedMail(u.email, "Reset your Famous TechX POS password", {
      businessName: biz?.name as string | undefined,
      greeting: `Hi ${m.full_name},`,
      title: "Your manager reset your password",
      paragraphs: [
        `A manager at ${biz?.name ?? "your business"} has reset your Famous TechX POS password, so you'll need to choose a new one before your next shift.`,
        "Don't worry - your sales history, shifts and settings are all untouched. Only your sign-in details are changing.",
      ],
      steps: [
        "Tap the button below to open your personal password page.",
        "Choose a strong new password (at least 8 characters, with upper and lower case letters and a number).",
        "Sign in again. If you use a till, you'll set your 4-digit POS PIN the first time you log in.",
      ],
      action: { label: "Choose a new password", url: link, note: "This link is valid for 1 hour and can only be used once." },
      footnote: "If you didn't expect this, check with your manager before clicking. Your old password no longer works until you set a new one.",
    });
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
  const ok = await sendBrandedMail(u.email, `Your invitation to ${biz?.name} on Famous TechX POS`, {
    businessName: biz?.name as string | undefined,
    greeting: `Hi ${m.full_name},`,
    title: `You're invited to ${biz?.name ?? "Famous TechX POS"}`,
    paragraphs: [
      `Great news - ${actor.member.full_name} has added you to the team at ${biz?.name ?? "your business"} on Famous TechX POS.`,
      "Everything you need to sell, track stock and hand over shifts is ready and waiting. Setting up your account takes about a minute.",
    ],
    steps: [
      "Tap the button below to accept your invitation.",
      "Create your own password (at least 8 characters, with upper and lower case letters and a number).",
      "Sign in and set your 4-digit POS PIN the first time you use a till. You're ready to sell!",
    ],
    action: { label: "Accept my invitation", url: link, note: "This link is valid for 7 days and can only be used once." },
    footnote: "If you weren't expecting this invitation, you can safely ignore this email - nothing changes until you accept.",
  });
  return { ok: true, emailed: ok ? (u.email as string) : undefined, inviteLink: ok ? undefined : link };
}

/**
 * Owner-only permanent removal of a login. This is a SOFT delete: the membership row and every
 * business record that points at it (sales, shifts, stock movements, approvals, receipts…) are left
 * untouched, so history and reports still show the employee's name. Only access is revoked.
 */
export async function deleteEmployee(db: Db, actor: Actor, memberId: string, i: { reason?: string | null } = {}) {
  if (!actor.isOwner) throw forbidden("owner_only", "Only the owner can delete employee accounts.");
  requirePassword(actor);
  const m = await memberInOrg(db, actor, memberId, true);
  if (memberId === actor.memberId) throw bad("cannot_delete_self", "You can't delete your own account.");
  if (bool(m.is_owner)) throw forbidden("owner_cannot_be_deleted", "The owner's account can't be deleted. Transfer ownership first.");
  if (m.deleted_at) throw bad("already_deleted", "This employee has already been deleted.");
  if (!clean(i.reason)) throw bad("reason_required", "Please give a reason. It is kept in the activity log.");
  const when = nowSql();
  await db.tx(async (tx) => {
    // Status deactivated frees the seat; deleted_at marks it permanent and is exposed to the UI.
    await tx.run(
      "UPDATE business_members SET status = 'deactivated', deleted_at = ?, deleted_by = ?, deactivated_at = ?, pin_hash = NULL, pin_failed = 0, pin_locked_until = NULL WHERE id = ?",
      [when, actor.memberId, when, memberId],
    );
    // Invalidate outstanding invite / reset links and end this business's sessions only.
    await tx.run("UPDATE auth_tokens SET used_at = ? WHERE member_id = ? AND used_at IS NULL", [when, memberId]);
    await revokeMemberSessions(tx, m.user_id, actor.orgId);
    await audit(tx, { orgId: actor.orgId, actorId: actor.memberId }, "employee", "Deleted employee",
      `${m.full_name} - ${clean(i.reason)}`, { entityType: "member", entityId: memberId });
  });
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
