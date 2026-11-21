/** Accounts: sign-up, sign-in (email or phone), password reset, profile and the session context (`GET /me`). */
import { isDuplicateKey, one, type Db } from "../../core/db.js";
import { bad, forbidden, unauthorized } from "../../core/errors.js";
import { sendMail } from "../../core/mail.js";
import { getSettings } from "../../core/settings.js";
import { nowSql } from "../../core/time.js";
import { bool, clean, digits, n, nullIfEmpty, uuid } from "../../core/values.js";
import { hashSecret, sha256, verifySecret } from "../../auth/crypto.js";
import { issueLinkToken } from "../../auth/link-tokens.js";
import { createSession, loadActor, revokeUserSessions, type SessionInfo } from "../../auth/sessions.js";
import { mapMember } from "../people/employees.service.js";
import { mapRole } from "../people/roles.service.js";

export function validatePassword(pw: unknown) {
  if (typeof pw !== "string" || pw.length < 8) throw bad("weak_password", "Use at least 8 characters for the password.");
  return pw;
}

const normEmail = (e: unknown) => clean(e).toLowerCase();

export async function signUp(db: Db, i: { email: string; password: string; fullName: string }) {
  const email = normEmail(i.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad("invalid_email", "Enter a valid email address.");
  validatePassword(i.password);
  const name = clean(i.fullName) || email.split("@")[0]!;
  const id = uuid();
  try {
    await db.run("INSERT INTO users (id, email, full_name, password_hash, created_at) VALUES (?,?,?,?,?)", [id, email, name, await hashSecret(i.password), nowSql()]);
  } catch (e) {
    if (isDuplicateKey(e)) throw bad("email_in_use", "That email already has an account. Sign in instead.");
    throw e;
  }
  return createSession(db, { userId: id, method: "password" });
}

/** Email + password, or phone + password (staff without email). Same error for every failure. */
export async function signIn(db: Db, i: { identifier: string; password: string; device?: string }) {
  const ident = clean(i.identifier);
  const fail = () => unauthorized("Email/phone or password is incorrect.");
  if (!ident || !i.password) throw fail();
  let candidates: string[] = [];
  if (ident.includes("@")) {
    const u = await one(db, "SELECT id FROM users WHERE email = ?", [ident.toLowerCase()]);
    if (u) candidates = [u.id];
  } else {
    const want = digits(ident);
    if (want.length < 9) throw fail();
    const rows = await db.all("SELECT user_id, phone FROM business_members WHERE phone IS NOT NULL AND status IN ('active','invited','suspended')");
    candidates = [...new Set(rows.filter((r) => digits(r.phone) === want).map((r) => r.user_id as string))];
  }
  for (const uid of candidates) {
    const u = await one(db, "SELECT * FROM users WHERE id = ?", [uid]);
    if (!u || !(await verifySecret(i.password, u.password_hash))) continue;
    const member = await one(db, "SELECT * FROM business_members WHERE user_id = ? AND status <> 'deactivated' ORDER BY is_owner DESC, created_at LIMIT 1", [uid]);
    if (member?.status === "suspended") throw forbidden("account_suspended", "Your account is suspended. Speak to the owner or a manager.");
    if (member) {
      await db.run("INSERT INTO sign_in_events (id, organization_id, member_id, terminal_id, method, success, device, created_at) VALUES (?,?,?,?,?,?,?,?)",
        [uuid(), member.organization_id, member.id, null, "password", true, (i.device ?? "Browser").slice(0, 120), nowSql()]);
      await db.run("UPDATE business_members SET last_sign_in_at = ? WHERE id = ?", [nowSql(), member.id]);
    }
    return createSession(db, { userId: uid, memberId: member?.id ?? null, orgId: member?.organization_id ?? null, method: "password" });
  }
  // Log failed attempts against a known member (helps spot guessing).
  if (candidates.length === 1) {
    const m = await one(db, "SELECT id, organization_id FROM business_members WHERE user_id = ? LIMIT 1", [candidates[0]]);
    if (m) await db.run("INSERT INTO sign_in_events (id, organization_id, member_id, terminal_id, method, success, device, created_at) VALUES (?,?,?,?,?,?,?,?)",
      [uuid(), m.organization_id, m.id, null, "password", false, (i.device ?? "Browser").slice(0, 120), nowSql()]);
  }
  throw fail();
}

export async function requestPasswordReset(db: Db, emailIn: string) {
  const email = normEmail(emailIn);
  const u = await one(db, "SELECT * FROM users WHERE email = ?", [email]);
  if (!u) return; // never reveal whether an account exists
  await db.run("UPDATE auth_tokens SET used_at = ? WHERE user_id = ? AND purpose = 'reset' AND used_at IS NULL", [nowSql(), u.id]);
  const link = await issueLinkToken(db, u.id, "reset");
  await sendMail(email, "Reset your Famous TechX POS password",
    `Hi ${u.full_name},\n\nSomeone asked to reset your password. Open this link within 1 hour to choose a new one:\n\n${link}\n\nIf this wasn't you, ignore this email.`);
}

/** Invite acceptance and password reset: sets the password, activates an invited member, signs in. */
export async function redeemLinkToken(db: Db, i: { token: string; password: string }) {
  validatePassword(i.password);
  const hash = sha256(clean(i.token));
  let userId = "";
  await db.tx(async (tx) => {
    const t = await one(tx, "SELECT * FROM auth_tokens WHERE token_hash = ? AND used_at IS NULL FOR UPDATE", [hash]);
    if (!t || t.expires_at < nowSql() || !["invite", "reset"].includes(String(t.purpose)))
      throw bad("link_expired", "This link has expired or was already used. Ask for a new one.");
    const claimed = await tx.run("UPDATE auth_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL", [nowSql(), hash]);
    if (!claimed) throw bad("link_expired", "This link has expired or was already used. Ask for a new one.");
    userId = t.user_id as string;
    await tx.run("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?", [await hashSecret(i.password), userId]);
    // A new password/link retires every other outstanding link for this account.
    await tx.run("UPDATE auth_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL AND token_hash <> ?", [nowSql(), userId, hash]);
    if (t.purpose === "invite") {
      if (t.member_id)
        await tx.run("UPDATE business_members SET status = 'active' WHERE id = ? AND user_id = ? AND status = 'invited'", [t.member_id, userId]);
      else
        await tx.run("UPDATE business_members SET status = 'active' WHERE user_id = ? AND status = 'invited'", [userId]);
    }
    await revokeUserSessions(tx, userId);
  });
  const m = await one(db, "SELECT * FROM business_members WHERE user_id = ? AND status = 'active' ORDER BY is_owner DESC LIMIT 1", [userId]);
  return createSession(db, { userId, memberId: m?.id, orgId: m?.organization_id, method: "password" });
}

export async function changePassword(db: Db, s: SessionInfo, i: { current?: string; next: string }) {
  validatePassword(i.next);
  const u = await one(db, "SELECT * FROM users WHERE id = ?", [s.userId]);
  if (!u) throw unauthorized();
  // A forced change (temp password) doesn't need the current one again: they just signed in with it.
  if (!bool(u.must_change_password) && !(await verifySecret(i.current ?? "", u.password_hash)))
    throw bad("wrong_password", "Current password is incorrect.");
  await db.run("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?", [await hashSecret(i.next), s.userId]);
  await db.run("UPDATE auth_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL", [nowSql(), s.userId]);
  await revokeUserSessions(db, s.userId, s.id);
}

export async function updateMyProfile(db: Db, s: SessionInfo, i: { fullName?: string; phone?: string }) {
  const name = clean(i.fullName);
  if (name) await db.run("UPDATE users SET full_name = ? WHERE id = ?", [name, s.userId]);
  if (i.phone !== undefined) await db.run("UPDATE users SET phone = ? WHERE id = ?", [nullIfEmpty(i.phone), s.userId]);
  if (name || i.phone !== undefined)
    await db.run("UPDATE business_members SET full_name = COALESCE(?, full_name), phone = COALESCE(?, phone) WHERE user_id = ?", [name || null, i.phone === undefined ? null : nullIfEmpty(i.phone), s.userId]);
}

/** Everything the app needs after sign-in. */
export async function me(db: Db, s: SessionInfo) {
  const u = await one(db, "SELECT id, email, phone, full_name, must_change_password FROM users WHERE id = ?", [s.userId]);
  if (!u) throw unauthorized();
  const actor = await loadActor(db, s);
  const base = { user: { id: u.id, email: u.email, phone: u.phone, fullName: u.full_name }, mustChangePassword: bool(u.must_change_password), passwordSession: s.method === "password", method: s.method, terminalId: s.terminalId };
  if (!actor) return { ...base, business: null, member: null, role: null, permissions: [], branchIds: [], settings: {}, plan: null };
  const b = await one(db, "SELECT * FROM businesses WHERE id = ?", [actor.orgId]);
  const plan = await one(db, "SELECT * FROM subscription_plans WHERE id = ?", [b?.plan_id ?? "business"]);
  const settings = await getSettings(db, actor.orgId);
  return {
    ...base,
    business: b && { id: b.id, name: b.name, category: b.category, phone: b.phone, email: b.email, address: b.address, tin: b.tin, registration_no: b.registration_no, logo_url: b.logo_url, timezone: b.timezone, currency: b.currency },
    member: mapMember(actor.member, [...actor.branchIds], [], true),
    role: mapRole(actor.role, [], 0),
    permissions: [...actor.perms],
    branchIds: [...actor.branchIds],
    settings,
    plan: plan && { id: plan.id, name: plan.name, maxMembers: n(plan.max_members), maxBranches: n(plan.max_branches) },
  };
}
