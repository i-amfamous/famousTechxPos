/** Online barcode lookup to pre-fill new products: cache → UPCitemdb → Open Food Facts. */
import { config } from "../../config.js";
import { isDuplicateKey, one, type Db } from "../../core/db.js";
import { iso, nowSql } from "../../core/time.js";
import { n, parseJson } from "../../core/values.js";
import { requireAnyPerm, type Actor } from "../../auth/access.js";

type Found = { name: string; brand?: string; description?: string; category?: string; images: string[]; source: string };

async function fetchJson(url: string, headers: Record<string, string> = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await fetch(url, { headers, signal: ctl.signal });
    return res.ok ? await res.json() : null;
  } finally { clearTimeout(timer); }
}

async function upcItemDb(code: string): Promise<Found | null> {
  const key = config.upcItemDbKey;
  const j = await fetchJson(key ? `https://api.upcitemdb.com/prod/v1/lookup?upc=${code}` : `https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`,
    key ? { user_key: key, key_type: "3scale" } : {});
  const it = j?.items?.[0];
  if (!it?.title) return null;
  return { name: it.title, brand: it.brand || undefined, description: it.description || undefined, category: it.category?.split(">").pop()?.trim(),
    images: (it.images ?? []).filter((u: string) => u.startsWith("https://")).slice(0, 4), source: "UPCitemdb" };
}

async function openFoodFacts(code: string): Promise<Found | null> {
  const j = await fetchJson(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,image_url,categories`, { "User-Agent": "FamousTechXPOS/1.0" });
  if (j?.status !== 1 || !j.product?.product_name) return null;
  return { name: j.product.product_name, brand: j.product.brands?.split(",")[0]?.trim(), category: j.product.categories?.split(",").pop()?.trim(),
    images: j.product.image_url ? [j.product.image_url] : [], source: "Open Food Facts" };
}

/** Test hook to replace the online providers. */
export const barcodeProviders: { list: ((code: string) => Promise<Found | null>)[] } = { list: [upcItemDb, openFoodFacts] };

export async function lookupBarcodeOnline(db: Db, actor: Actor, raw: string) {
  requireAnyPerm(actor, ["products.manage", "inventory.adjust", "purchases.manage"]);
  const code = String(raw ?? "").replace(/\D/g, "");
  if (code.length < 8 || code.length > 14) return { found: false, product: null };
  const cached = await one(db, "SELECT * FROM barcode_cache WHERE barcode = ?", [code]);
  const ageDays = cached ? (Date.now() - new Date(iso(cached.fetched_at)!).getTime()) / 86_400_000 : Infinity;
  if (cached && ageDays < (cached.found ? 30 : 7)) return { found: !!n(cached.found), product: parseJson<Found | null>(cached.data, null), cached: true };
  if (!config.barcodeOnline) return { found: false, product: null };
  let found: Found | null = null;
  for (const provider of barcodeProviders.list) {
    try { found = await provider(code); } catch (e) { console.warn("[barcode]", (e as Error).message); }
    if (found) break;
  }
  const data = found ? JSON.stringify(found) : null;
  if (cached) await db.run("UPDATE barcode_cache SET data = ?, found = ?, fetched_at = ? WHERE barcode = ?", [data, !!found, nowSql(), code]);
  else {
    try { await db.run("INSERT INTO barcode_cache (barcode, data, found, fetched_at) VALUES (?,?,?,?)", [code, data, !!found, nowSql()]); }
    catch (e) { if (!isDuplicateKey(e)) throw e; }
  }
  return { found: !!found, product: found };
}

