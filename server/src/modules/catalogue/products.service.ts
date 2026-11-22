/** Products, variants and categories. */
import { audit } from "../../core/activity-log.js";
import { isDuplicateKey, one, type Db, type Row } from "../../core/db.js";
import { bad, notFound } from "../../core/errors.js";
import { cents, money } from "../../core/money.js";
import { nowSql } from "../../core/time.js";
import { bool, clean, n, nullIfEmpty, uuid } from "../../core/values.js";
import { requireBranch, requirePerm, type Actor } from "../../auth/access.js";
import { applyStock } from "../inventory/stock-ledger.js";

/** Accepts normal URLs and compact data URLs from the browser's file/camera picker. */
function cleanImageUrl(value?: string | null): string | null {
  const url = nullIfEmpty(value);
  if (!url) return null;
  if (!/^(https?:\/\/|data:image\/(jpeg|png|webp|gif);base64,)/i.test(url))
    throw bad("invalid_image", "Use a web address or an image file.");
  if (url.length > 90_000) throw bad("image_too_large", "That photo is too large. Try a smaller image.");
  return url;
}

export const mapProduct = (p: Row, stock: number, variants: Row[]) => ({
  id: p.id, name: p.name, sku: p.sku, barcode: p.barcode ?? undefined, categoryId: p.category_id ?? "", costPrice: n(p.cost_price),
  sellingPrice: n(p.selling_price), unit: p.unit, taxable: bool(p.taxable), status: p.status, stock, reorderLevel: n(p.reorder_level),
  brand: p.brand ?? undefined, description: p.description ?? undefined, imageUrl: p.image_url ?? undefined,
  variants: variants.length ? variants.map((v) => ({ id: v.id, label: v.label, sku: v.sku, barcode: v.barcode ?? undefined, stock: n(v.stock), sellingPrice: v.selling_price == null ? undefined : n(v.selling_price) })) : undefined,
});

export async function listCategories(db: Db, actor: Actor) {
  return (await db.all("SELECT * FROM categories WHERE organization_id = ? ORDER BY name", [actor.orgId])).map((c) => ({ id: c.id, name: c.name, color: c.color }));
}

const COLORS = ["bg-brand-100 text-brand-800", "bg-violet-100 text-violet-800", "bg-emerald-100 text-emerald-800", "bg-amber-100 text-amber-800", "bg-sky-100 text-sky-800", "bg-rose-100 text-rose-800"];

export async function createCategory(db: Db, actor: Actor, name: string) {
  requirePerm(actor, "products.manage");
  const nm = clean(name);
  if (!nm) throw bad("name_required", "Enter a category name.");
  const existing = await one(db, "SELECT * FROM categories WHERE organization_id = ? AND name = ?", [actor.orgId, nm]);
  if (existing) return { id: existing.id, name: existing.name, color: existing.color };
  const id = uuid();
  const color = COLORS[Math.floor(Math.random() * COLORS.length)]!;
  await db.run("INSERT INTO categories (id, organization_id, name, color, created_at) VALUES (?,?,?,?,?)", [id, actor.orgId, nm, color, nowSql()]);
  return { id, name: nm, color };
}

/** Products with stock at a branch. */
export async function listProducts(db: Db, actor: Actor, branchId: string) {
  requireBranch(actor, branchId);
  const [products, inv, variants] = await Promise.all([
    db.all("SELECT * FROM products WHERE organization_id = ? ORDER BY name", [actor.orgId]),
    db.all("SELECT product_id, variant_key, quantity FROM inventory WHERE branch_id = ?", [branchId]),
    db.all("SELECT * FROM product_variants WHERE organization_id = ? ORDER BY label", [actor.orgId]),
  ]);
  const stock = new Map<string, number>();
  const vstock = new Map<string, number>();
  for (const i of inv) {
    stock.set(i.product_id, (stock.get(i.product_id) ?? 0) + n(i.quantity));
    if (i.variant_key) vstock.set(i.variant_key, n(i.quantity));
  }
  const byProduct = new Map<string, typeof variants>();
  for (const v of variants) byProduct.set(v.product_id, [...(byProduct.get(v.product_id) ?? []), { ...v, stock: vstock.get(v.id) ?? 0 }]);
  return products.map((p) => mapProduct(p, stock.get(p.id) ?? 0, byProduct.get(p.id) ?? []));
}

function dupError(e: unknown): never {
  const msg = String((e as Error)?.message ?? "");
  if (isDuplicateKey(e)) {
    if (/barcode/i.test(msg)) throw bad("duplicate_barcode", "Another product already uses that barcode.");
    throw bad("duplicate_sku", "Another product already uses that SKU.");
  }
  throw e;
}

/** Checks a barcode isn't already used by another product or variant in the business. */
async function assertBarcodeFree(db: Db, orgId: string, barcode: string | null, exceptProduct?: string) {
  if (!barcode) return;
  const p = await one(db, "SELECT id FROM products WHERE organization_id = ? AND barcode = ? AND id <> ?", [orgId, barcode, exceptProduct ?? ""]);
  const v = await one(db, "SELECT id FROM product_variants WHERE organization_id = ? AND barcode = ? AND product_id <> ?", [orgId, barcode, exceptProduct ?? ""]);
  if (p || v) throw bad("duplicate_barcode", "Another product already uses that barcode.");
}

export interface ProductInput {
  branchId?: string; name: string; sku: string; barcode?: string | null; brand?: string | null; description?: string | null; imageUrl?: string | null; categoryId?: string | null;
  costPrice: number; sellingPrice: number; unit?: string; taxable?: boolean; reorderLevel?: number; openingStock?: number;
  variants?: { label: string; sku: string; barcode?: string | null; sellingPrice?: number | null; openingStock?: number }[];
}

export async function createProduct(db: Db, actor: Actor, p: ProductInput) {
  requirePerm(actor, "products.manage");
  const name = clean(p.name), sku = clean(p.sku);
  if (!name || !sku) throw bad("missing_fields", "Name and SKU are required.");
  if (!(n(p.sellingPrice) >= 0) || !(n(p.costPrice) >= 0)) throw bad("invalid_price", "Prices can't be negative.");
  if (p.branchId) requireBranch(actor, p.branchId);
  const barcode = nullIfEmpty(p.barcode);
  return db.tx(async (tx) => {
    await assertBarcodeFree(tx, actor.orgId, barcode);
    const id = uuid();
    try {
      await tx.run(`INSERT INTO products (id, organization_id, category_id, name, brand, description, image_url, sku, barcode, cost_price, selling_price, unit, taxable, reorder_level, status, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, actor.orgId, nullIfEmpty(p.categoryId), name, nullIfEmpty(p.brand), nullIfEmpty(p.description), cleanImageUrl(p.imageUrl), sku, barcode,
          money(cents(p.costPrice)), money(cents(p.sellingPrice)), clean(p.unit) || "pc", p.taxable !== false, n(p.reorderLevel), "active", nowSql(), nowSql()]);
    } catch (e) { dupError(e); }
    if (n(p.openingStock) > 0 && p.branchId)
      await applyStock(tx, { orgId: actor.orgId, branchId: p.branchId, productId: id, delta: n(p.openingStock), type: "opening", reason: "Opening stock", refType: "product", refId: id, actorId: actor.memberId });
    for (const v of p.variants ?? []) {
      if (!clean(v.label)) continue;
      const vid = uuid();
      const vb = nullIfEmpty(v.barcode);
      await assertBarcodeFree(tx, actor.orgId, vb);
      try {
        await tx.run("INSERT INTO product_variants (id, organization_id, product_id, label, sku, barcode, selling_price) VALUES (?,?,?,?,?,?,?)",
          [vid, actor.orgId, id, clean(v.label), clean(v.sku) || `${sku}-${clean(v.label).toUpperCase().replace(/\W+/g, "")}`, vb, v.sellingPrice == null ? null : money(cents(v.sellingPrice))]);
      } catch (e) { dupError(e); }
      if (n(v.openingStock) > 0 && p.branchId)
        await applyStock(tx, { orgId: actor.orgId, branchId: p.branchId, productId: id, variantId: vid, delta: n(v.openingStock), type: "opening", reason: "Opening stock", refType: "product", refId: id, actorId: actor.memberId });
    }
    await audit(tx, { orgId: actor.orgId, actorId: actor.memberId }, "stock", "Created product", name, { branchId: p.branchId ?? null, entityType: "product", entityId: id });
    return { id };
  });
}

export async function updateProduct(db: Db, actor: Actor, id: string, p: Partial<ProductInput> & { status?: "active" | "archived" }) {
  requirePerm(actor, "products.manage");
  const cur = await one(db, "SELECT * FROM products WHERE id = ? AND organization_id = ?", [id, actor.orgId]);
  if (!cur) throw notFound("Product not found.");
  const sets: string[] = [];
  const vals: (string | number | boolean | null)[] = [];
  const set = (col: string, v: string | number | boolean | null) => { sets.push(`${col} = ?`); vals.push(v); };
  if (p.name !== undefined) { if (!clean(p.name)) throw bad("missing_fields", "Name is required."); set("name", clean(p.name)); }
  if (p.sku !== undefined) { if (!clean(p.sku)) throw bad("missing_fields", "SKU is required."); set("sku", clean(p.sku)); }
  if (p.barcode !== undefined) { await assertBarcodeFree(db, actor.orgId, nullIfEmpty(p.barcode), id); set("barcode", nullIfEmpty(p.barcode)); }
  if (p.brand !== undefined) set("brand", nullIfEmpty(p.brand));
  if (p.description !== undefined) set("description", nullIfEmpty(p.description));
  if (p.imageUrl !== undefined) set("image_url", cleanImageUrl(p.imageUrl));
  if (p.categoryId !== undefined) set("category_id", nullIfEmpty(p.categoryId));
  if (p.costPrice !== undefined) set("cost_price", money(cents(p.costPrice)));
  if (p.sellingPrice !== undefined) set("selling_price", money(cents(p.sellingPrice)));
  if (p.unit !== undefined) set("unit", clean(p.unit) || "pc");
  if (p.taxable !== undefined) set("taxable", !!p.taxable);
  if (p.reorderLevel !== undefined) set("reorder_level", n(p.reorderLevel));
  if (p.status !== undefined) { if (!["active", "archived"].includes(p.status)) throw bad("invalid_status", "Choose a valid product status."); set("status", p.status); }
  if (!sets.length) return;
  set("updated_at", nowSql());
  try {
    await db.run(`UPDATE products SET ${sets.join(", ")} WHERE id = ?`, [...vals, id]);
  } catch (e) { dupError(e); }
  if (p.sellingPrice !== undefined && money(cents(p.sellingPrice)) !== n(cur.selling_price))
    await audit(db, { orgId: actor.orgId, actorId: actor.memberId }, "stock", "Changed price", `${cur.name}: ${n(cur.selling_price).toFixed(2)} → ${money(cents(p.sellingPrice)).toFixed(2)}`, { entityType: "product", entityId: id });
  else if (p.status !== undefined && p.status !== cur.status)
    await audit(db, { orgId: actor.orgId, actorId: actor.memberId }, "stock", p.status === "archived" ? "Archived product" : "Restored product", cur.name, { entityType: "product", entityId: id });
}
