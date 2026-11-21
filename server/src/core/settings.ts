/** Per-business settings (stored as JSON on the business) with their defaults. */
import { one, type Db } from "./db.js";
import { parseJson } from "./values.js";

export const DEFAULT_SETTINGS = {
  pin_length: 4, auto_lock_minutes: 5, pin_max_attempts: 5, pin_lock_minutes: 15, notify_pin_lockouts: true,
  shared_drawer: false, require_shift: true, variance_threshold: 10, flag_shift_hours: 12, block_negative_stock: true,
  tax_rate: 0, prices_include_tax: true, receipt_footer: "Thank you for shopping with us!", receipt_paper: "80", business_hours: "08:00 – 20:00",
};

export type Settings = typeof DEFAULT_SETTINGS & Record<string, unknown>;

export async function getSettings(db: Db, orgId: string): Promise<Settings> {
  const b = await one(db, "SELECT settings FROM businesses WHERE id = ?", [orgId]);
  return { ...DEFAULT_SETTINGS, ...parseJson<Record<string, unknown>>(b?.settings, {}) } as Settings;
}
