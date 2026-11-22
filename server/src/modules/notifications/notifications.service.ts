/** In-app notifications, targeted at a person or at everyone holding a permission. */
import { inList, one, type Db } from "../../core/db.js";
import { iso } from "../../core/time.js";
import { parseJson } from "../../core/values.js";
import type { Actor } from "../../auth/access.js";

/**
 * A person only sees notices sent after they joined the business. The later of the
 * user account and the membership is the cutoff, so someone added to an older
 * account still misses everything sent before they were added.
 */
async function joinCutoff(db: Db, actor: Actor): Promise<string | null> {
  const [user, member] = await Promise.all([
    one(db, "SELECT created_at FROM users WHERE id = ?", [actor.userId]),
    one(db, "SELECT created_at FROM business_members WHERE id = ?", [actor.memberId]),
  ]);
  const times = [user?.created_at, member?.created_at, actor.member?.created_at]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .sort();
  return times.at(-1) ?? null;
}

export async function listNotifications(db: Db, actor: Actor) {
  const cutoff = await joinCutoff(db, actor);
  const visible = cutoff ? " AND created_at >= ?" : "";
  const params = cutoff ? [actor.orgId, cutoff] : [actor.orgId];
  const rows = await db.all(`SELECT * FROM notifications WHERE organization_id = ?${visible} ORDER BY created_at DESC LIMIT 200`, params);
  return rows
    .filter((x) => (x.member_id ? x.member_id === actor.memberId : !x.audience_perm || actor.perms.has(x.audience_perm)))
    .slice(0, 100)
    .map((x) => ({ id: x.id, type: x.type, title: x.title, body: x.body, createdAt: iso(x.created_at), read: parseJson<string[]>(x.read_by, []).includes(actor.memberId) }));
}

export async function markNotificationsRead(db: Db, actor: Actor, ids?: string[] | null) {
  const cutoff = await joinCutoff(db, actor);
  const visible = cutoff ? " AND created_at >= ?" : "";
  const rows = ids?.length
    ? await db.all(`SELECT id, read_by, member_id, audience_perm FROM notifications WHERE organization_id = ? AND id IN (${inList(ids)})${visible}`, [actor.orgId, ...ids, ...(cutoff ? [cutoff] : [])])
    : await db.all(`SELECT id, read_by, member_id, audience_perm FROM notifications WHERE organization_id = ?${visible} ORDER BY created_at DESC LIMIT 200`, cutoff ? [actor.orgId, cutoff] : [actor.orgId]);
  for (const r of rows) {
    if (r.member_id ? r.member_id !== actor.memberId : !r.audience_perm || !actor.perms.has(r.audience_perm)) continue;
    const readBy = parseJson<string[]>(r.read_by, []);
    if (readBy.includes(actor.memberId)) continue;
    await db.run("UPDATE notifications SET read_by = ? WHERE id = ?", [JSON.stringify([...readBy, actor.memberId].slice(-500)), r.id]);
  }
}
