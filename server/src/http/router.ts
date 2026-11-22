/**
 * A tiny framework-agnostic router. Each module declares its endpoints as data (`Route[]`); Express and the
 * test-suite both run them through `dispatch`, so tests exercise exactly the production request path.
 *
 * Access levels:
 *   public  - no sign-in (sign-in itself, the till roster which uses its own device token)
 *   session - any signed-in user, even before they belong to a business
 *   member  - an active employee of a business; fine-grained permissions are checked in services
 */
import { assertSessionDevice, loadActor, readSession, type SessionInfo } from "../auth/sessions.js";
import type { Actor } from "../auth/access.js";
import type { Db } from "../core/db.js";
import { AppError, forbidden } from "../core/errors.js";

export interface RequestContext {
  db: Db;
  /** Parsed JSON body (always an object). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  /** Bearer token from `Authorization`. */
  token?: string;
  /** Device credential of a registered till, from `X-Terminal-Token`. */
  terminalToken?: string;
  userAgent?: string;
}
export interface SessionContext extends RequestContext { session: SessionInfo }
export interface MemberContext extends SessionContext { actor: Actor }

type Method = "get" | "post" | "put" | "patch" | "delete";
interface RouteBase { method: Method; path: string; /** Max requests per client per minute. */ limit?: number }
export type Route =
  | (RouteBase & { auth: "public"; run: (c: RequestContext) => Promise<unknown> })
  | (RouteBase & { auth: "session"; run: (c: SessionContext) => Promise<unknown> })
  | (RouteBase & { auth: "member"; run: (c: MemberContext) => Promise<unknown> });

/** Response body for commands that have nothing else to return. */
export const ok = { ok: true } as const;

/** The required `branchId` query parameter used by branch-scoped lists. */
export function branchQuery(c: RequestContext): string {
  const branchId = c.query.branchId;
  if (!branchId) throw new AppError(400, "branch_required", "branchId is required.");
  return branchId;
}

/* ───────── Matching ───────── */
export interface Router { match(method: string, path: string): { route: Route; params: Record<string, string> } | null }

export function createRouter(routes: Route[]): Router {
  const compiled = routes.map((route) => {
    const keys: string[] = [];
    const pattern = route.path.replace(/:(\w+)/g, (_, key: string) => { keys.push(key); return "([^/]+)"; });
    return { route, keys, re: new RegExp(`^${pattern}/?$`) };
  });
  return {
    match(method, path) {
      const verb = method.toLowerCase();
      for (const { route, keys, re } of compiled) {
        if (route.method !== verb) continue;
        const m = re.exec(path);
        if (!m) continue;
        try {
          return { route, params: Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1] ?? "")])) };
        } catch {
          return null; // a malformed % escape in the URL is simply not a valid route
        }
      }
      return null;
    },
  };
}

/* ───────── Rate limiting ───────── */
const WINDOW_MS = 60_000;
const hits = new Map<string, { count: number; resetAt: number }>();

/** Fixed one-minute window per client and route - enough to slow down password and PIN guessing. */
function rateLimit(key: string, max: number) {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt < now) {
    if (hits.size > 50_000) hits.clear();
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  if (++entry.count > max) throw new AppError(429, "rate_limited", "Too many attempts. Wait a minute and try again.");
}

/* ───────── Dispatch ───────── */
export async function dispatch(route: Route, request: RequestContext, clientId: string): Promise<unknown> {
  if (route.limit) rateLimit(`${clientId}|${route.method}|${route.path}`, route.limit);
  const c: RequestContext = { ...request, body: request.body && typeof request.body === "object" ? request.body : {} };

  if (route.auth === "public") return (await route.run(c)) ?? ok;

  const session = await readSession(c.db, c.token);
  await assertSessionDevice(c.db, session, c.terminalToken);
  if (route.auth === "session") return (await route.run({ ...c, session })) ?? ok;

  const actor = await loadActor(c.db, session);
  if (!actor) throw forbidden("no_business", "Create or join a business first.");
  return (await route.run({ ...c, session, actor })) ?? ok;
}
