/** Employees, roles, access and activity. */
import { ok, type Route } from "../../http/router.js";
import { deleteEmployee, forceSignOut, resendInvite, resetEmployeePassword, setMemberStatus, transferOwnership } from "./account-admin.service.js";
import { listActivity, listSignIns } from "./activity.service.js";
import { createEmployee, listEmployees, saveMemberAccess, updateEmployeeProfile } from "./employees.service.js";
import { deleteRole, listPermissions, listRoles, saveRole } from "./roles.service.js";
import { resetMemberPin } from "../tills/pins.service.js";

export const peopleRoutes: Route[] = [
  { method: "get", path: "/permissions", auth: "member", run: async () => listPermissions() },
  { method: "get", path: "/roles", auth: "member", run: (c) => listRoles(c.db, c.actor) },
  { method: "post", path: "/roles", auth: "member", run: (c) => saveRole(c.db, c.actor, { ...c.body, id: null }) },
  { method: "put", path: "/roles/:id", auth: "member", run: (c) => saveRole(c.db, c.actor, { ...c.body, id: c.params.id }) },
  { method: "delete", path: "/roles/:id", auth: "member", run: async (c) => { await deleteRole(c.db, c.actor, c.params.id); return ok; } },
  { method: "get", path: "/employees", auth: "member", run: (c) => listEmployees(c.db, c.actor) },
  { method: "post", path: "/employees", auth: "member", run: (c) => createEmployee(c.db, c.actor, c.body) },
  { method: "patch", path: "/employees/:id", auth: "member", run: async (c) => { await updateEmployeeProfile(c.db, c.actor, c.params.id, c.body); return ok; } },
  { method: "delete", path: "/employees/:id", auth: "member", run: async (c) => { await deleteEmployee(c.db, c.actor, c.params.id, c.body); return ok; } },
  { method: "put", path: "/employees/:id/access", auth: "member", run: async (c) => { await saveMemberAccess(c.db, c.actor, c.params.id, c.body); return ok; } },
  { method: "post", path: "/employees/:id/status", auth: "member", run: async (c) => { await setMemberStatus(c.db, c.actor, c.params.id, c.body); return ok; } },
  { method: "post", path: "/employees/:id/sign-out", auth: "member", run: async (c) => { await forceSignOut(c.db, c.actor, c.params.id); return ok; } },
  { method: "post", path: "/employees/:id/reset-password", auth: "member", run: (c) => resetEmployeePassword(c.db, c.actor, c.params.id) },
  { method: "post", path: "/employees/:id/resend-invite", auth: "member", run: (c) => resendInvite(c.db, c.actor, c.params.id) },
  { method: "post", path: "/employees/:id/reset-pin", auth: "member", run: async (c) => { await resetMemberPin(c.db, c.actor, c.params.id); return ok; } },
  { method: "post", path: "/employees/:id/make-owner", auth: "member", run: async (c) => { await transferOwnership(c.db, c.actor, c.params.id); return ok; } },
  { method: "get", path: "/activity", auth: "member", run: (c) => listActivity(c.db, c.actor) },
  { method: "get", path: "/sign-ins", auth: "member", run: (c) => listSignIns(c.db, c.actor) },
];
