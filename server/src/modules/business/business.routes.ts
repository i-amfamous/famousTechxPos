/** Branches and business settings. */
import type { Route } from "../../http/router.js";
import { listBranches, saveBranch } from "./branches.service.js";
import { saveSettings } from "./settings.service.js";

export const businessRoutes: Route[] = [
  { method: "get", path: "/branches", auth: "member", run: (c) => listBranches(c.db, c.actor) },
  { method: "post", path: "/branches", auth: "member", run: (c) => saveBranch(c.db, c.actor, c.body) },
  { method: "patch", path: "/branches/:id", auth: "member", run: (c) => saveBranch(c.db, c.actor, { ...c.body, id: c.params.id }) },
  { method: "patch", path: "/settings", auth: "member", run: (c) => saveSettings(c.db, c.actor, c.body) },
];
