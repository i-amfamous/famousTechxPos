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
import { emitChange } from "../realtime/changes.js";

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
  /** Exact JSON bytes, used to verify webhook signatures. */
  rawBody?: Buffer;
  /** Selected request headers needed by public webhook routes. */
  headers?: Record<string, string | undefined>;
}
export interface SessionContext extends RequestContext { session: SessionInfo }
export interface MemberContext extends SessionContext { actor: Actor }

type Method = "get" | "post" | "put" | "patch" | "delete";
interface RouteBase {
  method: Method;
  path: string;
  /** Max requests per client per minute. */
  limit?: number;
  /** Change category to broadcast after a successful write. `false` means the route emits nothing. */
  change?: string | false;
}
export type Route =
  | (RouteBase & { auth: "public"; run: (c: RequestContext) => Promise<unknown> })
  | (RouteBase & { auth: "session"; run: (c: SessionContext) => Promise<unknown> })
  | (RouteBase & { auth: "member"; run: (c: MemberContext) => Promise<unknown> });

/** Response body for commands that have nothing else to return. */
export const ok = { ok: true } as const;

/** The required `branchId` query parameter used by branch-scoped lists. */
export function branchQuery(c: RequestContext): string {
  const branchId = c.query.branchId;
  if (!branchId) throw new AppError(400, "branch_required", "Choose a branch and try again.");
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

/* ───────── Change notices ───────── */
/** Maps a route to a broad data category. The client uses it only to decide what to refetch. */
export function changeTypeForPath(path: string): string {
  const first = path.replace(/^\//, "").split("/")[0] ?? "";
  const map: Record<string, string> = {
    business: "business", branches: "branches", settings: "settings", terminals: "terminals",
    approvals: "approvals", shifts: "shifts", "cash-movements": "shifts",
    checkout: "sales", sales: "sales", "held-carts": "sales",
    customers: "customers", employees: "employees", roles: "roles", approvers: "employees",
    categories: "products", products: "products", barcode: "products",
    stock: "inventory", transfers: "inventory",
    expenses: "expenses", suppliers: "purchasing", "purchase-orders": "purchasing",
    notifications: "notifications", reports: "reports", auth: "session", me: "employees",
  };
  if (first === "me" && path.includes("/password")) return "session";
  return map[first] ?? "general";
}

/* ───────── Dispatch ───────── */
export async function dispatch(route: Route, request: RequestContext, clientId: string): Promise<unknown> {
  if (route.limit) rateLimit(`${clientId}|${route.method}|${route.path}`, route.limit);
  const c: RequestContext = { ...request, body: request.body && typeof request.body === "object" ? request.body : {} };
  let session: SessionInfo | undefined;
  let actor: Actor | undefined;
  let out: unknown;

  if (route.auth === "public") {
    out = await route.run(c);
  } else {
    session = await readSession(c.db, c.token);
    await assertSessionDevice(c.db, session, c.terminalToken);
    if (route.auth === "member") {
      const loaded = await loadActor(c.db, session);
      if (!loaded) throw forbidden("no_business", "Create or join a business first.");
      actor = loaded;
      out = await route.run({ ...c, session, actor });
    } else {
      out = await route.run({ ...c, session });
    }
  }

  // Only successful writes broadcast. Services that are idempotent set `change: false`
  // and publish their own notice when a row really changed.
  if (route.method !== "get" && route.change !== false) {
    const returnedOrg = out && typeof out === "object" ? (out as { organizationId?: unknown }).organizationId : undefined;
    const orgId = actor?.orgId ?? session?.orgId ?? (typeof returnedOrg === "string" ? returnedOrg : undefined);
    const type = route.change ?? changeTypeForPath(route.path);
    if (orgId && type) emitChange({ orgId, type, at: Date.now() });
  }
  return out ?? ok;
}
