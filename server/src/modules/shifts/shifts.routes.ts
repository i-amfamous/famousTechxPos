/** Shifts and the cash drawer. */
import { branchQuery, type Route } from "../../http/router.js";
import { closeShift, listCashMovements, listShifts, myOpenShift, openShift, recordCashMovement, shiftSummary } from "./shifts.service.js";

export const shiftsRoutes: Route[] = [
  { method: "get", path: "/shifts", auth: "member", run: (c) => listShifts(c.db, c.actor, branchQuery(c)) },
  { method: "get", path: "/shifts/current", auth: "member", run: async (c) => ({ shiftId: await myOpenShift(c.db, c.actor, c.query.terminalId ?? "") }) },
  { method: "get", path: "/shifts/:id/summary", auth: "member", run: (c) => shiftSummary(c.db, c.actor, c.params.id) },
  { method: "post", path: "/shifts", auth: "member", run: (c) => openShift(c.db, c.actor, c.body) },
  { method: "post", path: "/shifts/:id/cash-movements", auth: "member", run: (c) => recordCashMovement(c.db, c.actor, c.params.id, c.body) },
  { method: "post", path: "/shifts/:id/close", auth: "member", run: (c) => closeShift(c.db, c.actor, c.params.id, c.body) },
  { method: "get", path: "/cash-movements", auth: "member", run: (c) => listCashMovements(c.db, c.actor) },
];
