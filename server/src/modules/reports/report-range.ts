/** Date ranges and day bucketing in the business's time zone. */
import { one, type Db } from "../../core/db.js";
import { bad } from "../../core/errors.js";

interface Range { branchId: string | null; from: string; to: string }

export function parseRange(r: { branchId?: string | null; from?: string; to?: string }): Range {
  const from = r.from && !Number.isNaN(Date.parse(r.from)) ? r.from : new Date(Date.now() - 864e5).toISOString();
  const to = r.to && !Number.isNaN(Date.parse(r.to)) ? r.to : new Date().toISOString();
  if (Date.parse(to) <= Date.parse(from)) throw bad("invalid_range", "Choose a valid date range.");
  if (Date.parse(to) - Date.parse(from) > 400 * 864e5) throw bad("invalid_range", "Choose a range of a year or less.");
  return { branchId: r.branchId || null, from, to };
}

export async function timezone(db: Db, orgId: string) {
  const b = await one(db, "SELECT timezone FROM businesses WHERE id = ?", [orgId]);
  try { new Intl.DateTimeFormat("en-CA", { timeZone: b?.timezone || "UTC" }); return b?.timezone || "UTC"; } catch { return "UTC"; }
}

export const dayKey = (tz: string) => {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  return (d: Date) => f.format(d);
};

export function days(fromIso: string, toIso: string, tz: string) {
  const key = dayKey(tz);
  const out: string[] = [];
  const end = key(new Date(Date.parse(toIso) - 1000));
  for (let t = Date.parse(fromIso); ; t += 864e5) {
    const k = key(new Date(t));
    if (!out.includes(k)) out.push(k);
    if (k >= end || out.length > 400) break;
  }
  return out;
}
