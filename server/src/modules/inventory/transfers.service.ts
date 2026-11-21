/** Stock transfers between branches: dispatch takes stock out, receive puts it in. */
import { audit } from "../../core/activity-log.js";
import { inList, one, type Db } from "../../core/db.js";
import { bad } from "../../core/errors.js";
import { nextNumber } from "../../core/numbering.js";
import { iso, nowSql } from "../../core/time.js";
import { n, nullIfEmpty, uuid } from "../../core/values.js";
import { requireAnyPerm, requireBranch, requirePerm, type Actor } from "../../auth/access.js";
import { applyStock } from "./stock-ledger.js";

export async function listTransfers(db: Db, actor: Actor) {
  requireAnyPerm(actor, ["inventory.transfer", "inventory.adjust"]);
  const branches = [...actor.branchIds];
  const rows = branches.length
    ? await db.all(`SELECT * FROM stock_transfers WHERE organization_id = ? AND (from_branch_id IN (${inList(branches)}) OR to_branch_id IN (${inList(branches)})) ORDER BY created_at DESC LIMIT 100`, [actor.orgId, ...branches, ...branches])
    : [];
  const items = rows.length ? await db.all(`SELECT * FROM stock_transfer_items WHERE transfer_id IN (${inList(rows.map((r) => r.id))})`, rows.map((r) => r.id)) : [];
  return rows.map((t) => ({ id: t.id, number: t.number, fromBranchId: t.from_branch_id, toBranchId: t.to_branch_id, status: t.status, createdAt: iso(t.created_at), note: t.note ?? undefined,
    items: items.filter((i) => i.transfer_id === t.id).map((i) => ({ productId: i.product_id, quantity: n(i.quantity) })) }));
}

export async function createTransfer(db: Db, actor: Actor, i: { fromBranchId: string; toBranchId: string; items: { productId: string; quantity: number }[]; note?: string | null }) {
  requirePerm(actor, "inventory.transfer");
  requireBranch(actor, i.fromBranchId);
  if (i.fromBranchId === i.toBranchId) throw bad("invalid_branch", "Choose a different destination branch.");
  const to = await one(db, "SELECT * FROM branches WHERE id = ? AND organization_id = ?", [i.toBranchId, actor.orgId]);
  if (!to) throw bad("invalid_branch", "Choose a valid destination branch.");
  const merged = new Map<string, number>();
  for (const it of i.items ?? []) if (n(it.quantity) > 0) merged.set(it.productId, (merged.get(it.productId) ?? 0) + n(it.quantity));
  if (!merged.size) throw bad("empty_transfer", "Add at least one item.");
  return db.tx(async (tx) => {
    const id = uuid();
    const number = await nextNumber(tx, "stock_transfers", actor.orgId, "TR");
    await tx.run("INSERT INTO stock_transfers (id, organization_id, number, from_branch_id, to_branch_id, status, note, dispatched_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      [id, actor.orgId, number, i.fromBranchId, i.toBranchId, "dispatched", nullIfEmpty(i.note), actor.memberId, nowSql()]);
    for (const [productId, q] of merged) {
      await tx.run("INSERT INTO stock_transfer_items (transfer_id, product_id, quantity) VALUES (?,?,?)", [id, productId, q]);
      await applyStock(tx, { orgId: actor.orgId, branchId: i.fromBranchId, productId, delta: -q, type: "transfer_out", reason: `To ${to.name} (${number})`, refType: "transfer", refId: id, actorId: actor.memberId, allowNegative: false });
    }
    await audit(tx, { orgId: actor.orgId, actorId: actor.memberId }, "stock", "Dispatched transfer", number, { branchId: i.fromBranchId, entityType: "transfer", entityId: id });
    return { id, number };
  });
}

export async function receiveTransfer(db: Db, actor: Actor, id: string) {
  requirePerm(actor, "inventory.transfer");
  return db.tx(async (tx) => {
    const t = await one(tx, "SELECT * FROM stock_transfers WHERE id = ? AND organization_id = ? AND status = 'dispatched' FOR UPDATE", [id, actor.orgId]);
    if (!t) throw bad("transfer_not_open", "This transfer was already received.");
    requireBranch(actor, t.to_branch_id);
    const from = await one(tx, "SELECT name FROM branches WHERE id = ?", [t.from_branch_id]);
    for (const it of await tx.all("SELECT * FROM stock_transfer_items WHERE transfer_id = ?", [id]))
      await applyStock(tx, { orgId: actor.orgId, branchId: t.to_branch_id, productId: it.product_id, delta: n(it.quantity), type: "transfer_in", reason: `From ${from?.name} (${t.number})`, refType: "transfer", refId: id, actorId: actor.memberId });
    await tx.run("UPDATE stock_transfers SET status = 'received', received_by = ?, received_at = ? WHERE id = ?", [actor.memberId, nowSql(), id]);
    await audit(tx, { orgId: actor.orgId, actorId: actor.memberId }, "stock", "Received transfer", t.number, { branchId: t.to_branch_id, entityType: "transfer", entityId: id });
  });
}
