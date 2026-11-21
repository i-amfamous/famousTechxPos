/** Stock adjustments, receiving, movements and transfers. */
import { ok, branchQuery, type Route } from "../../http/router.js";
import { adjustStock, listStockMovements, receiveStock } from "./inventory.service.js";
import { createTransfer, listTransfers, receiveTransfer } from "./transfers.service.js";

export const inventoryRoutes: Route[] = [
  { method: "post", path: "/stock/adjust", auth: "member", run: (c) => adjustStock(c.db, c.actor, c.body) },
  { method: "post", path: "/stock/receive", auth: "member", run: (c) => receiveStock(c.db, c.actor, c.body) },
  { method: "get", path: "/stock/movements", auth: "member", run: (c) => listStockMovements(c.db, c.actor, branchQuery(c)) },
  { method: "get", path: "/transfers", auth: "member", run: (c) => listTransfers(c.db, c.actor) },
  { method: "post", path: "/transfers", auth: "member", run: (c) => createTransfer(c.db, c.actor, c.body) },
  { method: "post", path: "/transfers/:id/receive", auth: "member", run: async (c) => { await receiveTransfer(c.db, c.actor, c.params.id); return ok; } },
];
