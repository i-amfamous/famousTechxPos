/**
 * HTTP client for the Famous TechX API.
 *  - `VITE_API_URL` set   → live mode against the server: a full URL in production, or "/api" in development
 *                           (Vite proxies it to the local server, so phones on your Wi-Fi reach it too).
 *  - `VITE_API_URL` unset → DEMO mode: the app runs on sample data and never calls the network.
 *
 * Two credentials live on a device:
 *  - the session token (who is signed in) - sent as `Authorization: Bearer …`
 *  - the till token (this device is a registered till) - sent as `X-Terminal-Token`
 */
import { AppError, toAppError } from "./errors";

export const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(/\/$/, "");
export const DEMO = !API_URL;

const SESSION_KEY = "ftx.session";
const TERMINAL_KEY = "ftx.terminal";

/* ───────── Local storage (tolerates private mode) ───────── */
export const storage = {
  get<T>(key: string): T | null {
    try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
  },
  set(key: string, value: unknown) {
    try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};

/** This device's till link (set when the device is registered as a till). */
export interface TerminalLink { id: string; token: string }

export const credentials = {
  session: () => storage.get<string>(SESSION_KEY),
  setSession: (token: string | null) => storage.set(SESSION_KEY, token),
  terminal: () => storage.get<TerminalLink>(TERMINAL_KEY),
  setTerminal: (link: TerminalLink | null) => storage.set(TERMINAL_KEY, link),
};

/** Fired when the server rejects the session (signed out elsewhere, suspended, expired). */
export const SIGNED_OUT_EVENT = "ftx:signed-out";

type Query = Record<string, string | number | boolean | null | undefined>;
interface Options { query?: Query; body?: unknown; signal?: AbortSignal }

async function request<T>(method: string, path: string, { query, body, signal }: Options = {}): Promise<T> {
  if (DEMO) throw new AppError("The server isn't configured. Set VITE_API_URL in .env.", "demo");
  const url = new URL(API_URL + path, window.location.origin); // API_URL may be relative ("/api" via the dev proxy)
  for (const [k, v] of Object.entries(query ?? {})) if (v != null && v !== "") url.searchParams.set(k, String(v));

  const headers: Record<string, string> = { Accept: "application/json" };
  const token = credentials.session();
  const till = credentials.terminal();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (till) headers["X-Terminal-Token"] = till.token;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  // A hung request must not leave a sale spinning forever. Callers can still pass their own signal.
  const controller = signal ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), 20_000) : null;
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: signal ?? controller!.signal });
  } catch (e) {
    throw toAppError(e);
  } finally {
    if (timer) clearTimeout(timer);
  }
  const payload = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.ok) return payload as T;

  const { error: code = "server_error", message = "Something went wrong. Please try again.", ...details } = (payload ?? {}) as Record<string, unknown> & { error?: string; message?: string };
  // Only drop the session this request used: a slow request from before a PIN switch must not sign out the new person.
  if (res.status === 401 && code === "unauthorized" && token && credentials.session() === token) {
    credentials.setSession(null);
    window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
  }
  throw new AppError(String(message), String(code), details);
}

export const http = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path, { query }),
  post: <T = { ok: true }>(path: string, body: unknown = {}) => request<T>("POST", path, { body }),
  put: <T = { ok: true }>(path: string, body: unknown = {}) => request<T>("PUT", path, { body }),
  patch: <T = { ok: true }>(path: string, body: unknown = {}) => request<T>("PATCH", path, { body }),
  delete: <T = { ok: true }>(path: string, body?: unknown) => request<T>("DELETE", path, { body }),
};

/** WebSocket URL on the API server (phone-scanner relay). */
export const wsUrl = (path: string) => new URL(API_URL + path, window.location.origin).href.replace(/^http/, "ws");
