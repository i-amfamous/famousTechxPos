/** Suppliers and purchase orders. */
import { ok, type Route } from "../../http/router.js";
import { listPurchaseOrders, receivePurchaseOrder, savePurchaseOrder, setPurchaseOrderStatus } from "./purchase-orders.service.js";
import { listSuppliers, saveSupplier } from "./suppliers.service.js";

export const purchasingRoutes: Route[] = [
  { method: "get", path: "/suppliers", auth: "member", run: (c) => listSuppliers(c.db, c.actor) },
  { method: "post", path: "/suppliers", auth: "member", run: (c) => saveSupplier(c.db, c.actor, c.body) },
  { method: "patch", path: "/suppliers/:id", auth: "member", run: (c) => saveSupplier(c.db, c.actor, { ...c.body, id: c.params.id }) },
  { method: "get", path: "/purchase-orders", auth: "member", run: (c) => listPurchaseOrders(c.db, c.actor) },
  { method: "post", path: "/purchase-orders", auth: "member", run: (c) => savePurchaseOrder(c.db, c.actor, c.body) },
  { method: "post", path: "/purchase-orders/:id/status", auth: "member", run: async (c) => { await setPurchaseOrderStatus(c.db, c.actor, c.params.id, c.body.status); return ok; } },
  { method: "post", path: "/purchase-orders/:id/receive", auth: "member", run: async (c) => { await receivePurchaseOrder(c.db, c.actor, c.params.id, c.body); return ok; } },
];
