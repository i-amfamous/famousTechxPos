/** POS PINs: verification with lock-out, rules for new PINs, self-service change and manager reset. */
import { audit, notify } from "../../core/activity-log.js";
import { one, type Db, type Row } from "../../core/db.js";
import { bad, notFound } from "../../core/errors.js";
import { getSettings } from "../../core/settings.js";
import { addMinutes, nowSql } from "../../core/time.js";
import { n } from "../../core/values.js";
import { requirePassword, requirePerm, type Actor } from "../../auth/access.js";
import { hashSecret, verifySecret } from "../../auth/crypto.js";

type PinResult = "ok" | "wrong" | "locked" | "no_pin";

/** Verifies a PIN with lock-out after too many attempts. */
export async function checkPin(db: Db, memberId: string, pin: string): Promise<{ result: PinResult; attemptsLeft?: number }> {
  return db.tx(async (tx) => {
    const m = await one(tx, "SELECT * FROM business_members WHERE id = ? FOR UPDATE", [memberId]);
    if (!m?.pin_hash) return { result: "no_pin" as const };
    if (m.pin_locked_until && m.pin_locked_until > nowSql()) return { result: "locked" as const };
    if (await verifySecret(String(pin ?? ""), m.pin_hash)) {
      await tx.run("UPDATE business_members SET pin_failed = 0, pin_locked_until = NULL WHERE id = ?", [memberId]);
      return { result: "ok" as const };
    }
    const s = await getSettings(tx, m.organization_id);
    const failed = n(m.pin_failed) + 1;
    if (failed >= n(s.pin_max_attempts)) {
      await tx.run("UPDATE business_members SET pin_failed = 0, pin_locked_until = ? WHERE id = ?", [addMinutes(n(s.pin_lock_minutes)), memberId]);
      await audit(tx, { orgId: m.organization_id, actorId: m.id }, "auth", "PIN locked", `${failed} failed PIN attempts`);
      if (s.notify_pin_lockouts) await notify(tx, m.organization_id, "security", `PIN locked: ${m.full_name}`, "Too many wrong PIN attempts. Reset the PIN from Employees if needed.", "employees.manage");
      return { result: "locked" as const };
    }
    await tx.run("UPDATE business_members SET pin_failed = ? WHERE id = ?", [failed, memberId]);
    return { result: "wrong" as const, attemptsLeft: Math.max(0, n(s.pin_max_attempts) - failed) };
  });
}

async function validatePin(db: Db, orgId: string, pin: string) {
  const len = n((await getSettings(db, orgId)).pin_length) || 4;
  if (!new RegExp(`^\\d{${len}}$`).test(pin)) throw bad("pin_format", `PIN must be ${len} digits.`);
  if (/^(\d)\1+$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin)) throw bad("pin_too_simple", "That PIN is too easy to guess.");
}

export async function setPin(db: Db, member: Row, pin: string) {
  await validatePin(db, member.organization_id, pin);
  await db.run("UPDATE business_members SET pin_hash = ?, pin_failed = 0, pin_locked_until = NULL WHERE id = ?", [await hashSecret(pin), member.id]);
}

export async function setMyPin(db: Db, actor: Actor, pin: string) {
  requirePassword(actor);
  await setPin(db, actor.member, String(pin ?? ""));
  await audit(db, { orgId: actor.orgId, actorId: actor.memberId }, "auth", "Changed POS PIN", "");
}

export async function resetMemberPin(db: Db, actor: Actor, memberId: string) {
  requirePerm(actor, "employees.manage", { password: true });
  const m = await one(db, "SELECT * FROM business_members WHERE id = ? AND organization_id = ?", [memberId, actor.orgId]);
  if (!m) throw notFound("Employee not found.");
  await db.run("UPDATE business_members SET pin_hash = NULL, pin_failed = 0, pin_locked_until = NULL WHERE id = ?", [memberId]);
  await audit(db, { orgId: actor.orgId, actorId: actor.memberId }, "employee", "Reset POS PIN", m.full_name, { entityType: "member", entityId: memberId });
}
