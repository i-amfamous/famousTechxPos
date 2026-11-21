/** Products, categories and barcode lookup. */
import { ok, branchQuery, type Route } from "../../http/router.js";
import { lookupBarcodeOnline } from "./barcode.service.js";
import { createCategory, createProduct, listCategories, listProducts, updateProduct } from "./products.service.js";

export const catalogueRoutes: Route[] = [
  { method: "get", path: "/categories", auth: "member", run: (c) => listCategories(c.db, c.actor) },
  { method: "post", path: "/categories", auth: "member", run: (c) => createCategory(c.db, c.actor, c.body.name) },
  { method: "get", path: "/products", auth: "member", run: (c) => listProducts(c.db, c.actor, branchQuery(c)) },
  { method: "post", path: "/products", auth: "member", run: (c) => createProduct(c.db, c.actor, c.body) },
  { method: "patch", path: "/products/:id", auth: "member", run: async (c) => { await updateProduct(c.db, c.actor, c.params.id, c.body); return ok; } },
  { method: "get", path: "/barcode/:code", auth: "member", limit: 60, run: (c) => lookupBarcodeOnline(c.db, c.actor, c.params.code) },
];
