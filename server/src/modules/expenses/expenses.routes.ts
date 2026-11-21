/** Expenses. */
import { ok, type Route } from "../../http/router.js";
import { listExpenses, saveExpense, voidExpense } from "./expenses.service.js";

export const expensesRoutes: Route[] = [
  { method: "get", path: "/expenses", auth: "member", run: (c) => listExpenses(c.db, c.actor) },
  { method: "post", path: "/expenses", auth: "member", run: (c) => saveExpense(c.db, c.actor, c.body) },
  { method: "post", path: "/expenses/:id/void", auth: "member", run: async (c) => { await voidExpense(c.db, c.actor, c.params.id, c.body.reason); return ok; } },
];
