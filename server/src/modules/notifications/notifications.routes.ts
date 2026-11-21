/** Notifications. */
import { ok, type Route } from "../../http/router.js";
import { listNotifications, markNotificationsRead } from "./notifications.service.js";

export const notificationsRoutes: Route[] = [
  { method: "get", path: "/notifications", auth: "member", run: (c) => listNotifications(c.db, c.actor) },
  { method: "post", path: "/notifications/read", auth: "member", run: async (c) => { await markNotificationsRead(c.db, c.actor, c.body?.ids); return ok; } },
];
