/** Checkout, sales history, receipts, refunds, voids and held carts. */
import { ok, branchQuery, type Route } from "../../http/router.js";
import { checkout } from "./checkout.service.js";
import { discardHeld, holdCart, listHeld, resumeHeld } from "./held-carts.service.js";
import { refundSale, voidSale } from "./returns.service.js";
import { getSale, listSales, saleReceipt, saleRefunds } from "./sales.service.js";

export const salesRoutes: Route[] = [
  // Checkout emits its own notice only when a new sale is committed, never on idempotent replays.
  { method: "post", path: "/checkout", auth: "member", change: false, run: (c) => checkout(c.db, c.actor, c.body) },
  { method: "get", path: "/sales", auth: "member", run: (c) => listSales(c.db, c.actor, branchQuery(c)) },
  { method: "get", path: "/sales/:id", auth: "member", run: (c) => getSale(c.db, c.actor, c.params.id) },
  { method: "get", path: "/sales/:id/receipt", auth: "member", run: (c) => saleReceipt(c.db, c.actor, c.params.id) },
  { method: "get", path: "/sales/:id/refunds", auth: "member", run: (c) => saleRefunds(c.db, c.actor, c.params.id) },
  { method: "post", path: "/sales/:id/refund", auth: "member", run: (c) => refundSale(c.db, c.actor, c.params.id, c.body) },
  { method: "post", path: "/sales/:id/void", auth: "member", run: async (c) => { await voidSale(c.db, c.actor, c.params.id, c.body); return ok; } },
  { method: "get", path: "/held-carts", auth: "member", run: (c) => listHeld(c.db, c.actor, branchQuery(c)) },
  { method: "post", path: "/held-carts", auth: "member", run: (c) => holdCart(c.db, c.actor, c.body) },
  { method: "post", path: "/held-carts/:id/resume", auth: "member", run: async (c) => ({ lines: await resumeHeld(c.db, c.actor, c.params.id, c.body?.approvalId) }) },
  { method: "delete", path: "/held-carts/:id", auth: "member", run: async (c) => { await discardHeld(c.db, c.actor, c.params.id); return ok; } },
];
