/** Till registration and the locked-till endpoints (authenticated by the device's X-Terminal-Token). */
import { ok, type Route } from "../../http/router.js";
import { setMyPin } from "./pins.service.js";
import { listTerminals, lockTerminal, pinLogin, pinSetup, registerTerminal, revokeTerminal, roster } from "./tills.service.js";

export const tillsRoutes: Route[] = [
  { method: "post", path: "/me/pin", auth: "member", run: async (c) => { await setMyPin(c.db, c.actor, c.body.pin); return ok; } },
  { method: "get", path: "/terminal/roster", auth: "public", run: (c) => roster(c.db, c.terminalToken) },
  { method: "post", path: "/terminal/pin-login", auth: "public", limit: 30, run: (c) => pinLogin(c.db, c.terminalToken, c.body) },
  { method: "post", path: "/terminal/pin-setup", auth: "public", limit: 10, run: (c) => pinSetup(c.db, c.terminalToken, c.body) },
  { method: "post", path: "/terminal/lock", auth: "public", run: async (c) => { if (c.token) await lockTerminal(c.db, c.token); return ok; } },
  { method: "get", path: "/terminals", auth: "member", run: (c) => listTerminals(c.db, c.actor) },
  { method: "post", path: "/terminals", auth: "member", run: (c) => registerTerminal(c.db, c.actor, c.body) },
  { method: "post", path: "/terminals/:id/revoke", auth: "member", run: async (c) => { await revokeTerminal(c.db, c.actor, c.params.id); return ok; } },
];
