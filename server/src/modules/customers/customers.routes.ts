/** Customers. */
import { ok, type Route } from "../../http/router.js";
import { archiveCustomer, listCustomers, saveCustomer } from "./customers.service.js";

export const customersRoutes: Route[] = [
  { method: "get", path: "/customers", auth: "member", run: (c) => listCustomers(c.db, c.actor) },
  { method: "post", path: "/customers", auth: "member", run: (c) => saveCustomer(c.db, c.actor, c.body) },
  { method: "patch", path: "/customers/:id", auth: "member", run: (c) => saveCustomer(c.db, c.actor, { ...c.body, id: c.params.id }) },
  { method: "post", path: "/customers/:id/archive", auth: "member", run: async (c) => { await archiveCustomer(c.db, c.actor, c.params.id); return ok; } },
];
