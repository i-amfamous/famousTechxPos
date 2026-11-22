/**
 * Bearer sessions. The client holds an opaque random token; only its SHA-256 is stored, so a database
 * leak can't be replayed. Revoking a row signs that device out on its very next request.
 */
import { one, type Db } from "../core/db.js";
import { unauthorized } from "../core/errors.js";
import { addMinutes, nowSql } from "../core/time.js";
import { uuid } from "../core/values.js";
import { memberBranches, memberPermissions, type Actor } from "./access.js";
import { randomToken, sha256 } from "./crypto.js";

const PASSWORD_SESSION_MIN = 14 * 24 * 60; // 14 days (sliding)
const PIN_SESSION_MIN = 16 * 60;           // one long shift

/** Creates an opaque bearer token. Only its SHA-256 is stored. */
export async function createSession(db: Db, s: { userId: string; orgId?: string | null; memberId?: string | null; method: "password" | "pin"; terminalId?: string | null }) {
  const token = randomToken(32);
  const ttl = s.method === "pin" ? PIN_SESSION_MIN : PASSWORD_SESSION_MIN;
  await db.run(
    "INSERT INTO sessions (id, token_hash, user_id, organization_id, member_id, method, terminal_id, created_at, last_seen_at, expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [uuid(), sha256(token), s.userId, s.orgId ?? null, s.memberId ?? null, s.method, s.terminalId ?? null, nowSql(), nowSql(), addMinutes(ttl)],
  );
  return { token, expiresAt: addMinutes(ttl) };
}

export async function revokeSession(db: Db, token: string) {
  await db.run("UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL", [nowSql(), sha256(token)]);
}

/** Ends every session of a user (force sign-out, suspension, password change). */
export async function revokeUserSessions(db: Db, userId: string, exceptSessionId?: string) {
  await db.run("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id <> ?", [nowSql(), userId, exceptSessionId ?? ""]);
}

/** Ends sessions for one membership only — a person can belong to several businesses. */
export async function revokeMemberSessions(db: Db, userId: string, orgId: string) {
  await db.run("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND organization_id = ? AND revoked_at IS NULL", [nowSql(), userId, orgId]);
}

export interface SessionInfo { id: string; userId: string; method: "password" | "pin"; terminalId: string | null; memberId: string | null; orgId: string | null }

export async function readSession(db: Db, token: string | undefined): Promise<SessionInfo> {
  if (!token) throw unauthorized();
  const s = await one(db, "SELECT * FROM sessions WHERE token_hash = ?", [sha256(token)]);
  if (!s || s.revoked_at || s.expires_at < nowSql()) throw unauthorized("Your session has ended. Please sign in again.");
  // Sliding expiry for password sessions; touch at most once a minute.
  if (s.last_seen_at < addMinutes(-1)) {
    const exp = s.method === "password" ? addMinutes(PASSWORD_SESSION_MIN) : s.expires_at;
    await db.run("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?", [nowSql(), exp, s.id]);
  }
  return { id: s.id, userId: s.user_id, method: s.method, terminalId: s.terminal_id, memberId: s.member_id, orgId: s.organization_id };
}

/**
 * A PIN session is bound to the till it was opened on: every request must also carry that till's device token.
 * A copied PIN token is useless anywhere else.
 */
export async function assertSessionDevice(db: Db, s: SessionInfo, terminalToken: string | undefined) {
  if (s.method !== "pin") return;
  const till = terminalToken ? await one(db, "SELECT id FROM pos_terminals WHERE token_hash = ? AND status = 'active'", [sha256(terminalToken)]) : null;
  if (!till || till.id !== s.terminalId) throw unauthorized("This PIN sign-in only works on the till it was made on.");
}

/** Resolves the employee behind a session. Throws if they're not an active member. */
export async function loadActor(db: Db, s: SessionInfo): Promise<Actor | null> {
  const member = s.memberId
    ? await one(db, "SELECT * FROM business_members WHERE id = ?", [s.memberId])
    : await one(db, "SELECT * FROM business_members WHERE user_id = ? AND status IN ('active','invited') ORDER BY is_owner DESC, created_at LIMIT 1", [s.userId]);
  if (!member) return null;
  if (member.deleted_at) throw unauthorized("This account has been removed from the business. Contact the owner.");
  if (member.status !== "active") {
    if (member.status === "invited") return null;
    throw unauthorized("Your account isn't active. Ask the owner or a manager.");
  }
  const role = await one(db, "SELECT * FROM roles WHERE id = ?", [member.role_id]);
  return {
    sessionId: s.id, userId: s.userId, orgId: member.organization_id, memberId: member.id, isOwner: !!member.is_owner, roleId: member.role_id,
    perms: await memberPermissions(db, member), branchIds: await memberBranches(db, member), method: s.method, terminalId: s.terminalId, member, role: role ?? {},
  };
}
