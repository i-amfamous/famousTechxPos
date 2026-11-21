/** Business profile and settings. */
import { audit } from "../../core/activity-log.js";
import { one, type Db } from "../../core/db.js";
import { getSettings } from "../../core/settings.js";
import { nowSql } from "../../core/time.js";
import { clean, nullIfEmpty, parseJson } from "../../core/values.js";
import { requirePerm, type Actor } from "../../auth/access.js";

const BUSINESS_FIELDS = ["name", "category", "phone", "email", "address", "tin", "registration_no", "logo_url", "timezone"] as const;

export async function saveSettings(db: Db, actor: Actor, p: Record<string, unknown>) {
  requirePerm(actor, "settings.manage", { password: true });
  const b = await one(db, "SELECT * FROM businesses WHERE id = ?", [actor.orgId]);
  const sets: string[] = [];
  const vals: (string | null)[] = [];
  for (const f of BUSINESS_FIELDS) {
    if (p[f] === undefined) continue;
    if (f === "name" && !clean(p[f])) continue;
    sets.push(`${f} = ?`);
    vals.push(f === "name" ? clean(p[f]) : nullIfEmpty(p[f]));
  }
  const patch = (p.settings && typeof p.settings === "object" ? p.settings : {}) as Record<string, unknown>;
  if (Object.keys(patch).length) {
    sets.push("settings = ?");
    vals.push(JSON.stringify({ ...parseJson<Record<string, unknown>>(b?.settings, {}), ...patch }));
  }
  if (!sets.length) return getSettings(db, actor.orgId);
  await db.run(`UPDATE businesses SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`, [...vals, nowSql(), actor.orgId]);
  await audit(db, { orgId: actor.orgId, actorId: actor.memberId }, "settings", "Updated settings", [...Object.keys(patch), ...BUSINESS_FIELDS.filter((f) => p[f] !== undefined)].join(", "));
  return getSettings(db, actor.orgId);
}
