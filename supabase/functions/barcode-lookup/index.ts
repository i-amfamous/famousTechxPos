// GET ?code=8806095300011 - looks a barcode up online to pre-fill the "Add product" form.
// Order: cache → UPCitemdb (electronics & general goods) → Open Food Facts (groceries).
// Set UPCITEMDB_KEY for the paid UPCitemdb plan; without it the free trial endpoint is used (≈100 lookups/day).
import { admin, asCaller, cors, fail, json } from "../_shared/util.ts";

type Found = { name: string; brand?: string; description?: string; category?: string; images: string[]; source: string };

async function upcItemDb(code: string): Promise<Found | null> {
  const key = Deno.env.get("UPCITEMDB_KEY");
  const url = key ? `https://api.upcitemdb.com/prod/v1/lookup?upc=${code}` : `https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`;
  const res = await fetch(url, { headers: key ? { user_key: key, key_type: "3scale" } : {} });
  if (!res.ok) return null;
  const j = await res.json();
  const it = j?.items?.[0];
  if (!it?.title) return null;
  return {
    name: it.title, brand: it.brand || undefined, description: it.description || undefined,
    category: it.category?.split(">").pop()?.trim(), images: (it.images ?? []).filter((u: string) => u.startsWith("https://")).slice(0, 4), source: "UPCitemdb",
  };
}

async function openFoodFacts(code: string): Promise<Found | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,image_url,categories`, {
    headers: { "User-Agent": "FamousTechXPOS/1.0" },
  });
  if (!res.ok) return null;
  const j = await res.json();
  if (j?.status !== 1 || !j.product?.product_name) return null;
  return {
    name: j.product.product_name, brand: j.product.brands?.split(",")[0]?.trim(), category: j.product.categories?.split(",").pop()?.trim(),
    images: j.product.image_url ? [j.product.image_url] : [], source: "Open Food Facts",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { data: user } = await asCaller(req).auth.getUser();
    if (!user.user) return fail("not_signed_in", 401);

    const code = (new URL(req.url).searchParams.get("code") ?? (req.method === "POST" ? (await req.json()).code : "") ?? "").replace(/\D/g, "");
    if (code.length < 8 || code.length > 14) return fail("invalid_barcode");

    const db = admin();
    const { data: cached } = await db.from("barcode_cache").select("*").eq("barcode", code).maybeSingle();
    const fresh = cached && Date.now() - new Date(cached.fetched_at).getTime() < (cached.found ? 30 : 7) * 86_400_000;
    if (fresh) return json({ found: cached.found, product: cached.data, cached: true });

    let found: Found | null = null;
    try { found = await upcItemDb(code); } catch (e) { console.warn("upcitemdb", e); }
    if (!found) { try { found = await openFoodFacts(code); } catch (e) { console.warn("off", e); } }

    await db.from("barcode_cache").upsert({ barcode: code, data: found, found: !!found, fetched_at: new Date().toISOString() });
    return json({ found: !!found, product: found });
  } catch (e) {
    console.error(e);
    return fail("server_error", 500);
  }
});
