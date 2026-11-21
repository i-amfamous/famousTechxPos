/** Human-friendly document numbers (TR-0001, PO-0001) per business. */
import { one, type Db } from "./db.js";
import { n } from "./values.js";

export async function nextNumber(db: Db, table: string, orgId: string, prefix: string) {
  const r = await one(db, `SELECT COUNT(*) AS c FROM ${table} WHERE organization_id = ?`, [orgId]);
  return `${prefix}-${String(n(r?.c) + 1).padStart(4, "0")}`;
}
