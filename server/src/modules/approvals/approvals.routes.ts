/** Manager approvals entered on the requester's device. */
import { branchQuery, type Route } from "../../http/router.js";
import { approveAction, approvers } from "./approvals.service.js";

export const approvalsRoutes: Route[] = [
  { method: "get", path: "/approvers", auth: "member", run: (c) => approvers(c.db, c.actor, branchQuery(c), c.query.perm || "pos.approve") },
  { method: "post", path: "/approvals", auth: "member", limit: 30, run: (c) => approveAction(c.db, c.actor, c.body) },
];
