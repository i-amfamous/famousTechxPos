/** Sign-up, sign-in, password links, the session context and business creation. */
import { ok, type Route } from "../../http/router.js";
import { revokeSession } from "../../auth/sessions.js";
import { changePassword, me, redeemLinkToken, requestPasswordReset, signIn, signUp, updateMyProfile } from "./accounts.service.js";
import { createBusiness } from "./onboarding.service.js";

export const accountsRoutes: Route[] = [
  { method: "post", path: "/auth/signup", auth: "public", limit: 10, run: (c) => signUp(c.db, c.body) },
  { method: "post", path: "/auth/login", auth: "public", limit: 20, run: (c) => signIn(c.db, { ...c.body, device: c.userAgent?.slice(0, 120) }) },
  { method: "post", path: "/auth/logout", auth: "public", run: async (c) => { if (c.token) await revokeSession(c.db, c.token); return ok; } },
  { method: "post", path: "/auth/forgot", auth: "public", limit: 5, run: async (c) => { await requestPasswordReset(c.db, c.body.email); return ok; } },
  { method: "post", path: "/auth/reset", auth: "public", limit: 10, run: (c) => redeemLinkToken(c.db, c.body) },
  { method: "get", path: "/me", auth: "session", run: (c) => me(c.db, c.session) },
  { method: "post", path: "/me/password", auth: "session", limit: 10, run: async (c) => { await changePassword(c.db, c.session, c.body); return ok; } },
  { method: "patch", path: "/me/profile", auth: "session", run: async (c) => { await updateMyProfile(c.db, c.session, c.body); return ok; } },
  { method: "post", path: "/business", auth: "session", run: (c) => createBusiness(c.db, c.session, c.body) },
];
