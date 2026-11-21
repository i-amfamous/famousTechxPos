/** Tills (registered POS devices): registration, the locked-screen roster and PIN sign-in. */
import { audit } from "../../core/activity-log.js";
import { one, type Db, type Row } from "../../core/db.js";
import { AppError, bad, forbidden, notFound } from "../../core/errors.js";
import { getSettings } from "../../core/settings.js";
import { iso, nowSql } from "../../core/time.js";
import { bool, clean, n, uuid } from "../../core/values.js";
import { memberCan, memberHasBranch, requirePerm, type Actor } from "../../auth/access.js";
import { randomToken, sha256, verifySecret } from "../../auth/crypto.js";
import { createSession, revokeSession } from "../../auth/sessions.js";
import { checkPin, setPin } from "./pins.service.js";

export async function terminalByToken(db: Db, token: string | undefined): Promise<Row | null> {
  if (!token) return null;
  return one(db, "SELECT * FROM pos_terminals WHERE token_hash = ? AND status = 'active'", [sha256(token)]);
}

export async function listTerminals(db: Db, actor: Actor) {
  requirePerm(actor, "settings.manage");
  const rows = await db.all("SELECT * FROM pos_terminals WHERE organization_id = ? ORDER BY created_at", [actor.orgId]);
  return rows.map((t) => ({ id: t.id, name: t.name, code: t.code, branchId: t.branch_id, status: t.status, lastSeenAt: iso(t.last_seen_at ?? t.created_at), registeredBy: t.registered_by ?? "" }));
}

export async function registerTerminal(db: Db, actor: Actor, i: { name: string; branchId: string }) {
  requirePerm(actor, "settings.manage", { password: true });
  const br = await one(db, "SELECT * FROM branches WHERE id = ? AND organization_id = ? AND status = 'active'", [i.branchId, actor.orgId]);
  if (!br) throw bad("invalid_branch", "Choose an active branch.");
  const token = randomToken(32);
  const id = uuid();
  return db.tx(async (tx) => {
    const count = await one(tx, "SELECT COUNT(*) AS c FROM pos_terminals WHERE branch_id = ?", [i.branchId]);
    const name = clean(i.name) || "Till";
    await tx.run("INSERT INTO pos_terminals (id, organization_id, branch_id, name, code, token_hash, status, registered_by, last_seen_at, receipt_seq, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [id, actor.orgId, i.branchId, name, `T${n(count?.c) + 1}`, sha256(token), "active", actor.memberId, nowSql(), 0, nowSql()]);
    await audit(tx, { orgId: actor.orgId, actorId: actor.memberId }, "settings", "Registered till", name, { branchId: i.branchId, terminalId: id });
    // The plain token is returned once and stored only on the device.
    return { terminalId: id, token };
  });
}

export async function revokeTerminal(db: Db, actor: Actor, id: string) {
  requirePerm(actor, "settings.manage", { password: true });
  const t = await one(db, "SELECT * FROM pos_terminals WHERE id = ? AND organization_id = ?", [id, actor.orgId]);
  if (!t) throw notFound("Till not found.");
  await db.run("UPDATE pos_terminals SET status = 'revoked' WHERE id = ?", [id]);
  await db.run("UPDATE sessions SET revoked_at = ? WHERE terminal_id = ? AND revoked_at IS NULL", [nowSql(), id]);
  await audit(db, { orgId: actor.orgId, actorId: actor.memberId }, "settings", "Revoked till", t.name, { branchId: t.branch_id, terminalId: id });
}

/** What a locked till shows: its identity and who can unlock it. The device token is the credential. */
export async function roster(db: Db, token: string | undefined) {
  const t = await terminalByToken(db, token);
  if (!t) throw new AppError(404, "unknown_terminal", "This till isn't registered or was revoked.");
  await db.run("UPDATE pos_terminals SET last_seen_at = ? WHERE id = ?", [nowSql(), t.id]);
  const s = await getSettings(db, t.organization_id);
  const branch = await one(db, "SELECT id, name FROM branches WHERE id = ?", [t.branch_id]);
  const biz = await one(db, "SELECT id, name, logo_url FROM businesses WHERE id = ?", [t.organization_id]);
  const held = await one(db, "SELECT COUNT(*) AS c FROM held_carts WHERE branch_id = ?", [t.branch_id]);
  const members = await db.all(
    `SELECT m.*, r.name AS role_name FROM business_members m JOIN roles r ON r.id = m.role_id
     WHERE m.organization_id = ? AND m.status IN ('active','suspended') ORDER BY m.display_name`, [t.organization_id]);
  const out = [];
  for (const m of members) {
    if (!(await memberHasBranch(db, m.id, t.branch_id))) continue;
    if (!bool(m.is_owner) && !(await memberCan(db, m.id, "pos.sell")) && m.status === "active") continue;
    out.push({ id: m.id, fullName: m.full_name, displayName: m.display_name, avatarColor: m.avatar_color, roleName: m.role_name,
      hasPin: !!m.pin_hash, status: m.status, pinLocked: !!m.pin_locked_until && m.pin_locked_until > nowSql() });
  }
  return {
    terminal: { id: t.id, name: t.name, code: t.code, branchId: t.branch_id, organizationId: t.organization_id },
    branch: branch && { id: branch.id, name: branch.name },
    business: biz && { id: biz.id, name: biz.name, logoUrl: biz.logo_url },
    settings: { pin_length: s.pin_length, auto_lock_minutes: s.auto_lock_minutes },
    heldCount: n(held?.c),
    members: out,
  };
}

async function tillMember(db: Db, t: Row, memberId: string) {
  const m = await one(db, "SELECT * FROM business_members WHERE id = ? AND organization_id = ?", [memberId, t.organization_id]);
  if (!m || m.status !== "active") throw forbidden("not_allowed", "You can't use this till.");
  if (!(await memberHasBranch(db, m.id, t.branch_id)) || !(bool(m.is_owner) || (await memberCan(db, m.id, "pos.sell"))))
    throw forbidden("not_allowed", "You can't use this till.");
  return m;
}

async function startTillSession(db: Db, t: Row, m: Row) {
  await db.run("UPDATE sessions SET revoked_at = ? WHERE terminal_id = ? AND revoked_at IS NULL", [nowSql(), t.id]); // one person per till
  await db.run("UPDATE business_members SET last_sign_in_at = ? WHERE id = ?", [nowSql(), m.id]);
  await db.run("UPDATE pos_terminals SET last_seen_at = ? WHERE id = ?", [nowSql(), t.id]);
  return createSession(db, { userId: m.user_id, memberId: m.id, orgId: m.organization_id, method: "pin", terminalId: t.id });
}

const signInEvent = (db: Db, t: Row, memberId: string, ok: boolean) =>
  db.run("INSERT INTO sign_in_events (id, organization_id, member_id, terminal_id, method, success, device, created_at) VALUES (?,?,?,?,?,?,?,?)",
    [uuid(), t.organization_id, memberId, t.id, "pin", ok, t.name, nowSql()]);

export async function pinLogin(db: Db, token: string | undefined, i: { memberId: string; pin: string }) {
  const t = await terminalByToken(db, token);
  if (!t) throw new AppError(404, "unknown_terminal", "This till isn't registered or was revoked.");
  const m = await tillMember(db, t, i.memberId);
  const r = await checkPin(db, m.id, i.pin);
  await signInEvent(db, t, m.id, r.result === "ok");
  if (r.result === "no_pin") throw bad("no_pin", "Set up your PIN first.");
  if (r.result === "locked") throw new AppError(423, "locked", "PIN locked after too many attempts. A manager has been notified.");
  if (r.result === "wrong") throw new AppError(401, "wrong", `Wrong PIN.${r.attemptsLeft != null ? ` ${r.attemptsLeft} attempt${r.attemptsLeft === 1 ? "" : "s"} left.` : ""}`, { attemptsLeft: r.attemptsLeft });
  await audit(db, { orgId: t.organization_id, actorId: m.id }, "auth", "Signed in with PIN", t.name, { branchId: t.branch_id, terminalId: t.id });
  return startTillSession(db, t, m);
}

/** First-time PIN setup on a till: proves identity with the account password, then sets the PIN. */
export async function pinSetup(db: Db, token: string | undefined, i: { memberId: string; password: string; pin: string }) {
  const t = await terminalByToken(db, token);
  if (!t) throw new AppError(404, "unknown_terminal", "This till isn't registered or was revoked.");
  const m = await tillMember(db, t, i.memberId);
  const u = await one(db, "SELECT password_hash FROM users WHERE id = ?", [m.user_id]);
  if (!(await verifySecret(String(i.password ?? ""), u?.password_hash))) throw new AppError(401, "wrong_password", "Password is incorrect.");
  await setPin(db, m, String(i.pin ?? ""));
  await signInEvent(db, t, m.id, true);
  await audit(db, { orgId: t.organization_id, actorId: m.id }, "auth", "Created POS PIN", t.name, { branchId: t.branch_id, terminalId: t.id });
  return startTillSession(db, t, m);
}

export async function lockTerminal(db: Db, token: string) {
  await revokeSession(db, token);
}
