/** Employees: the list, adding people (invite or temporary password), profile and access changes. */
import { audit } from "../../core/activity-log.js";
import { inList, isDuplicateKey, one, type Db, type Row } from "../../core/db.js";
import { bad, forbidden, notFound } from "../../core/errors.js";
import { sendBrandedMail } from "../../core/mail.js";
import { iso, nowSql, today } from "../../core/time.js";
import { bool, clean, n, nullIfEmpty, uuid } from "../../core/values.js";
import { requirePerm, type Actor } from "../../auth/access.js";
import { hashSecret, randomPassword, randomToken } from "../../auth/crypto.js";
import { issueLinkToken } from "../../auth/link-tokens.js";
import { ALL_PERMS } from "../../auth/permission-catalogue.js";

/** `full` = include contact details and access overrides (employees.view). */
export const mapMember = (m: Row, branchIds: string[], overrides: { permission: string; effect: string }[], full: boolean) => ({
  id: m.id, fullName: m.full_name, displayName: m.display_name, roleId: m.role_id, branchIds,
  status: m.deleted_at ? "deleted" : m.status,
  deletedAt: iso(m.deleted_at) ?? undefined,
  avatarColor: m.avatar_color ?? "bg-brand-600", isOwner: bool(m.is_owner), hasPin: !!m.pin_hash,
  pinLocked: !!m.pin_locked_until && m.pin_locked_until > nowSql(),
  employeeCode: m.employee_code,
  email: full ? m.email ?? undefined : undefined,
  phone: full ? m.phone ?? "" : "",
  hireDate: full ? (m.hire_date ?? "") : "",
  lastSignInAt: full ? iso(m.last_sign_in_at) ?? undefined : undefined,
  overrides: full ? overrides : [],
});

const AVATARS = ["bg-brand-600", "bg-violet-600", "bg-emerald-600", "bg-amber-600", "bg-sky-600", "bg-rose-600", "bg-teal-600", "bg-fuchsia-600"];

export async function listEmployees(db: Db, actor: Actor) {
  const full = actor.perms.has("employees.view") || actor.perms.has("employees.manage");
  const rows = await db.all("SELECT * FROM business_members WHERE organization_id = ? ORDER BY full_name", [actor.orgId]);
  const ids = rows.map((r) => r.id);
  const access = ids.length ? await db.all(`SELECT * FROM member_branch_access WHERE member_id IN (${inList(ids)})`, ids) : [];
  const ov = ids.length && full ? await db.all(`SELECT * FROM member_permission_overrides WHERE member_id IN (${inList(ids)})`, ids) : [];
  return rows.map((m) => mapMember(m, access.filter((x) => x.member_id === m.id).map((x) => x.branch_id),
    ov.filter((o) => o.member_id === m.id).map((o) => ({ permission: o.perm_key, effect: o.effect })), full || m.id === actor.memberId));
}

export async function memberInOrg(db: Db, actor: Actor, memberId: string, allowDeleted = false) {
  const m = await one(db, "SELECT * FROM business_members WHERE id = ? AND organization_id = ?", [memberId, actor.orgId]);
  if (!m) throw notFound("Employee not found.");
  if (m.deleted_at && !allowDeleted) throw bad("employee_deleted", "This employee account was deleted. Their history is kept; add them again as a new employee if needed.");
  return m;
}

async function nextEmployeeCode(db: Db, orgId: string) {
  const rows = await db.all("SELECT employee_code FROM business_members WHERE organization_id = ?", [orgId]);
  const max = rows.reduce((m, r) => Math.max(m, Number(String(r.employee_code).replace(/\D/g, "")) || 0), 0);
  return `FTX-${String(max + 1).padStart(3, "0")}`;
}

async function validBranches(db: Db, actor: Actor, ids: string[]) {
  const uniq = [...new Set(ids ?? [])];
  if (!uniq.length) throw bad("branch_required", "Choose at least one branch.");
  if (!actor.isOwner && uniq.some((b) => !actor.branchIds.has(b))) throw forbidden("branch_not_allowed", "You can't give access to a branch you don't work at.");
  const rows = await db.all(`SELECT id FROM branches WHERE organization_id = ? AND id IN (${inList(uniq)})`, [actor.orgId, ...uniq]);
  if (rows.length !== uniq.length) throw bad("invalid_branch", "One of the branches isn't valid.");
  return uniq;
}

/** A non-owner may only assign their own role; only an owner can grant a more powerful one. */
async function assertRoleAssignable(db: Db, actor: Actor, role: Row) {
  if (role.role_key === "owner") throw bad("cannot_assign_owner", "Use 'Transfer ownership' to make someone the owner.");
  if (actor.isOwner) return;
  if (role.id !== actor.roleId) throw forbidden("role_not_allowed", "Only the owner can assign a different role.");
  const perms = await db.all("SELECT perm_key FROM role_permissions WHERE role_id = ?", [role.id]);
  if (perms.some((p) => !actor.perms.has(p.perm_key))) throw forbidden("role_not_allowed", "You don't hold every permission in that role.");
}

export interface NewEmployee { fullName: string; displayName?: string; phone: string; email?: string; roleId: string; branchIds: string[]; inviteMethod: "email" | "temp_password"; hireDate?: string; employeeCode?: string }

export async function createEmployee(db: Db, actor: Actor, i: NewEmployee) {
  requirePerm(actor, "employees.manage", { password: true });
  const fullName = clean(i.fullName);
  const email = clean(i.email).toLowerCase() || null;
  if (!fullName) throw bad("name_required", "Enter the employee's name.");
  if (!clean(i.phone)) throw bad("phone_required", "Enter a phone number.");
  if (i.inviteMethod === "email" && !email) throw bad("email_required", "Enter an email address to send the invite to.");
  const role = await one(db, "SELECT * FROM roles WHERE id = ? AND organization_id = ?", [i.roleId, actor.orgId]);
  if (!role) throw bad("invalid_role", "Choose a valid role.");
  await assertRoleAssignable(db, actor, role);
  const branches = await validBranches(db, actor, i.branchIds);

  const result = await db.tx(async (tx) => {
    const biz = await one(tx, "SELECT b.name, p.max_members FROM businesses b LEFT JOIN subscription_plans p ON p.id = b.plan_id WHERE b.id = ?", [actor.orgId]);
    const used = await one(tx, "SELECT COUNT(*) AS c FROM business_members WHERE organization_id = ? AND status <> 'deactivated'", [actor.orgId]);
    if (biz?.max_members != null && n(used?.c) >= n(biz.max_members)) throw bad("seat_limit_reached", "You've used all employee seats on your plan.");

    // Re-use an existing login for this email (e.g. someone who works at two businesses).
    let user = email ? await one(tx, "SELECT * FROM users WHERE email = ?", [email]) : null;
    let tempPassword: string | undefined;
    if (user) {
      const dup = await one(tx, "SELECT id FROM business_members WHERE organization_id = ? AND user_id = ?", [actor.orgId, user.id]);
      if (dup) throw bad("email_in_use", "That person is already an employee here.");
    } else {
      const uid = uuid();
      tempPassword = i.inviteMethod === "temp_password" ? randomPassword() : undefined;
      const hash = await hashSecret(tempPassword ?? randomToken(24)); // invitees set their own password from the link
      try {
        await tx.run("INSERT INTO users (id, email, phone, full_name, password_hash, must_change_password, created_at) VALUES (?,?,?,?,?,?,?)",
          [uid, email, nullIfEmpty(i.phone), fullName, hash, !!tempPassword, nowSql()]);
      } catch (e) {
        if (isDuplicateKey(e)) throw bad("email_in_use", "That email already has an account.");
        throw e;
      }
      user = { id: uid };
    }
    const memberId = uuid();
    const code = clean(i.employeeCode) || (await nextEmployeeCode(tx, actor.orgId));
    try {
      await tx.run(`INSERT INTO business_members (id, organization_id, user_id, role_id, full_name, display_name, email, phone, employee_code, status, is_owner, hire_date, avatar_color, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [memberId, actor.orgId, user.id, role.id, fullName, clean(i.displayName) || fullName.split(" ")[0], email, clean(i.phone), code,
          i.inviteMethod === "email" ? "invited" : "active", false, clean(i.hireDate) || today(), AVATARS[Math.floor(Math.random() * AVATARS.length)], nowSql()]);
    } catch (e) {
      if (isDuplicateKey(e)) throw bad("duplicate_code", "Another employee already uses that employee code.");
      throw e;
    }
    for (const b of branches) await tx.run("INSERT INTO member_branch_access (member_id, branch_id) VALUES (?,?)", [memberId, b]);
    await audit(tx, { orgId: actor.orgId, actorId: actor.memberId }, "employee", "Added employee", fullName, { entityType: "member", entityId: memberId });
    return { memberId, userId: user.id as string, tempPassword, businessName: biz?.name as string };
  });

  let inviteLink: string | undefined;
  let emailed: string | undefined;
  if (i.inviteMethod === "email" && email) {
    inviteLink = await issueLinkToken(db, result.userId, "invite", result.memberId);
    const ok = await sendBrandedMail(email, `You've been added to ${result.businessName} on Famous TechX POS`, {
      businessName: result.businessName,
      greeting: `Hi ${fullName},`,
      title: `Welcome to the team at ${result.businessName}`,
      paragraphs: [
        `${actor.member.full_name} has added you to the team at ${result.businessName} on Famous TechX POS. We're glad to have you on board!`,
        "Your account is all set up on our side. Just create your own password and you'll be ready for your first sale.",
      ],
      steps: [
        "Tap the button below to accept your invitation.",
        "Choose a strong password (at least 8 characters, with upper and lower case letters and a number).",
        "Sign in, then set your 4-digit POS PIN the first time you use a till.",
      ],
      action: { label: "Set my password", url: inviteLink, note: "This link is valid for 7 days and can only be used once." },
      footnote: "If you weren't expecting this invitation, you can safely ignore this email - your account won't be activated until you accept.",
    });
    if (ok) emailed = email;
  }
  // When email isn't set up the manager gets the link to share another way.
  return { memberId: result.memberId, tempPassword: result.tempPassword, emailed, inviteLink: emailed ? undefined : inviteLink };
}

export async function updateEmployeeProfile(db: Db, actor: Actor, memberId: string, p: { fullName?: string; displayName?: string; phone?: string; email?: string; employeeCode?: string; hireDate?: string }) {
  requirePerm(actor, "employees.manage", { password: true });
  const m = await memberInOrg(db, actor, memberId);
  if (bool(m.is_owner) && !actor.isOwner) throw forbidden("owner_cannot_be_changed", "The owner's account can't be changed by others.");
  try {
    await db.run(`UPDATE business_members SET full_name = ?, display_name = ?, phone = ?, email = ?, employee_code = ?, hire_date = ? WHERE id = ?`,
      [clean(p.fullName) || m.full_name, clean(p.displayName) || m.display_name, p.phone !== undefined ? nullIfEmpty(p.phone) : m.phone,
        p.email !== undefined ? nullIfEmpty(p.email)?.toLowerCase() ?? null : m.email, clean(p.employeeCode) || m.employee_code, clean(p.hireDate) || m.hire_date, memberId]);
  } catch (e) {
    if (isDuplicateKey(e)) throw bad("duplicate_code", "Another employee already uses that employee code.");
    throw e;
  }
  await audit(db, { orgId: actor.orgId, actorId: actor.memberId }, "employee", "Updated employee", clean(p.fullName) || m.full_name, { entityType: "member", entityId: memberId });
}

/** Role, per-employee overrides and branch access in one go. */
export async function saveMemberAccess(db: Db, actor: Actor, memberId: string, i: { roleId: string; overrides: { permission: string; effect: string }[]; branchIds: string[] }) {
  requirePerm(actor, "employees.manage", { password: true });
  const m = await memberInOrg(db, actor, memberId);
  if (bool(m.is_owner)) throw bad("owner_access_cannot_change", "The owner always has full access.");
  const role = await one(db, "SELECT * FROM roles WHERE id = ? AND organization_id = ?", [i.roleId, actor.orgId]);
  if (!role) throw bad("invalid_role", "Choose a valid role.");
  if (memberId === actor.memberId && role.id !== actor.roleId) throw forbidden("cannot_change_own_role", "You can't change your own role.");
  await assertRoleAssignable(db, actor, role);
  const overrides = (i.overrides ?? []).filter((o) => ALL_PERMS.includes(o.permission) && (o.effect === "grant" || o.effect === "revoke"));
  if (overrides.length && !actor.perms.has("roles.manage")) throw forbidden("permission_denied", "Only people who can manage roles can give individual permissions.");
  const branches = await validBranches(db, actor, i.branchIds);
  await db.tx(async (tx) => {
    const before = {
      role: m.role_id,
      overrides: (await tx.all("SELECT perm_key, effect FROM member_permission_overrides WHERE member_id = ?", [memberId])).map((o) => ({ permission: o.perm_key, effect: o.effect })),
      branches: (await tx.all("SELECT branch_id FROM member_branch_access WHERE member_id = ?", [memberId])).map((b) => b.branch_id),
    };
    await tx.run("UPDATE business_members SET role_id = ? WHERE id = ?", [role.id, memberId]);
    await tx.run("DELETE FROM member_permission_overrides WHERE member_id = ?", [memberId]);
    for (const o of overrides) await tx.run("INSERT INTO member_permission_overrides (member_id, perm_key, effect) VALUES (?,?,?)", [memberId, o.permission, o.effect]);
    await tx.run("DELETE FROM member_branch_access WHERE member_id = ?", [memberId]);
    for (const b of branches) await tx.run("INSERT INTO member_branch_access (member_id, branch_id) VALUES (?,?)", [memberId, b]);
    await audit(tx, { orgId: actor.orgId, actorId: actor.memberId }, "employee", "Changed access", m.full_name,
      { entityType: "member", entityId: memberId, meta: { before, after: { role: role.id, overrides, branches } } });
  });
}
