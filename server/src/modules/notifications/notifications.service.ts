/** In-app notifications, targeted at a person or at everyone holding a permission. */
import { inList, type Db } from "../../core/db.js";
import { iso } from "../../core/time.js";
import { parseJson } from "../../core/values.js";
import type { Actor } from "../../auth/access.js";

export async function listNotifications(db: Db, actor: Actor) {
  const rows = await db.all("SELECT * FROM notifications WHERE organization_id = ? ORDER BY created_at DESC LIMIT 200", [actor.orgId]);
  return rows
    .filter((x) => (x.member_id ? x.member_id === actor.memberId : !x.audience_perm || actor.perms.has(x.audience_perm)))
    .slice(0, 100)
    .map((x) => ({ id: x.id, type: x.type, title: x.title, body: x.body, createdAt: iso(x.created_at), read: parseJson<string[]>(x.read_by, []).includes(actor.memberId) }));
}

export async function markNotificationsRead(db: Db, actor: Actor, ids?: string[] | null) {
  const rows = ids?.length
    ? await db.all(`SELECT id, read_by, member_id, audience_perm FROM notifications WHERE organization_id = ? AND id IN (${inList(ids)})`, [actor.orgId, ...ids])
    : await db.all("SELECT id, read_by, member_id, audience_perm FROM notifications WHERE organization_id = ? ORDER BY created_at DESC LIMIT 200", [actor.orgId]);
  for (const r of rows) {
    if (r.member_id ? r.member_id !== actor.memberId : !r.audience_perm || !actor.perms.has(r.audience_perm)) continue;
    const readBy = parseJson<string[]>(r.read_by, []);
    if (readBy.includes(actor.memberId)) continue;
    await db.run("UPDATE notifications SET read_by = ? WHERE id = ?", [JSON.stringify([...readBy, actor.memberId].slice(-500)), r.id]);
  }
}
