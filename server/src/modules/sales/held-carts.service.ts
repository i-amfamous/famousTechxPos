/** Parked carts a cashier can resume later (another cashier needs permission or approval). */
import { one, type Db, type Row } from "../../core/db.js";
import { bad, forbidden, notFound } from "../../core/errors.js";
import { iso, nowSql } from "../../core/time.js";
import { clean, parseJson, uuid } from "../../core/values.js";
import { requireBranch, requirePerm, type Actor } from "../../auth/access.js";
import { consumeApproval } from "../approvals/approvals.service.js";

export const mapHeld = (h: Row) => ({ id: h.id, ownerId: h.owner_id, note: h.note, lines: parseJson(h.cart_lines, []), createdAt: iso(h.created_at) });

export async function listHeld(db: Db, actor: Actor, branchId: string) {
  requirePerm(actor, "pos.sell");
  requireBranch(actor, branchId);
  return (await db.all("SELECT * FROM held_carts WHERE organization_id = ? AND branch_id = ? ORDER BY created_at DESC", [actor.orgId, branchId])).map(mapHeld);
}

export async function holdCart(db: Db, actor: Actor, i: { branchId: string; terminalId?: string | null; lines: unknown[]; note?: string }) {
  requirePerm(actor, "pos.sell");
  requireBranch(actor, i.branchId);
  if (!Array.isArray(i.lines) || !i.lines.length) throw bad("empty_cart", "The cart is empty.");
  const id = uuid();
  await db.run("INSERT INTO held_carts (id, organization_id, branch_id, terminal_id, owner_id, note, cart_lines, created_at) VALUES (?,?,?,?,?,?,?,?)",
    [id, actor.orgId, i.branchId, i.terminalId ?? null, actor.memberId, clean(i.note).slice(0, 300), JSON.stringify(i.lines), nowSql()]);
  return { id };
}

export async function resumeHeld(db: Db, actor: Actor, id: string, approvalId?: string | null) {
  requirePerm(actor, "pos.sell");
  return db.tx(async (tx) => {
    const c = await one(tx, "SELECT * FROM held_carts WHERE id = ? AND organization_id = ? FOR UPDATE", [id, actor.orgId]);
    if (!c) throw notFound("That held cart was already resumed or discarded.");
    requireBranch(actor, c.branch_id);
    if (c.owner_id !== actor.memberId && !actor.perms.has("pos.take_over_cart")) await consumeApproval(tx, actor, approvalId, "take_over_cart", null, id);
    await tx.run("DELETE FROM held_carts WHERE id = ?", [id]);
    return mapHeld(c).lines;
  });
}

export async function discardHeld(db: Db, actor: Actor, id: string) {
  const c = await one(db, "SELECT * FROM held_carts WHERE id = ? AND organization_id = ?", [id, actor.orgId]);
  if (!c) return;
  requireBranch(actor, c.branch_id);
  if (c.owner_id !== actor.memberId && !actor.perms.has("pos.take_over_cart")) throw forbidden("permission_denied", "Only the cashier who held this cart can discard it.");
  await db.run("DELETE FROM held_carts WHERE id = ?", [id]);
}
