/** Dashboard and reports. */
import type { Route } from "../../http/router.js";
import { dashboard, employeePerformance, employeeReport, pnl } from "./reports.service.js";

export const reportsRoutes: Route[] = [
  { method: "get", path: "/reports/dashboard", auth: "member", run: (c) => dashboard(c.db, c.actor, c.query) },
  { method: "get", path: "/reports/employees", auth: "member", run: (c) => employeeReport(c.db, c.actor, c.query) },
  { method: "get", path: "/reports/employees/:id", auth: "member", run: (c) => employeePerformance(c.db, c.actor, c.params.id, c.query) },
  { method: "get", path: "/reports/pnl", auth: "member", run: (c) => pnl(c.db, c.actor, c.query) },
];
