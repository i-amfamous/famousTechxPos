/**
 * Keeps every open browser in step with the server.
 * The server sends small change notices over an authenticated WebSocket. On receipt we
 * refetch through the normal scoped API, so no row data is ever pushed to the browser.
 */
import { useEffect, type ReactNode } from "react";
import { DEMO, credentials, wsUrl } from "@/lib/http";
import { invalidateAll, refreshSession } from "@/lib/query";
import { useSession } from "./session";

/** Changes to identity, settings or access need a fresh /me, not just list refetches. */
const SESSION_EVENTS = new Set([
  "session", "auth", "business", "branches", "settings", "employees", "roles", "terminals", "sync",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function LiveUpdatesProvider({ children }: { children: ReactNode }) {
  const { ready, signedIn, user, posUser, orgId, terminalToken } = useSession();

  useEffect(() => {
    if (DEMO || !ready || (!orgId && !terminalToken)) return;

    let closed = false;
    let authRejected = false;
    let hasConnected = false;
    let attempt = 0;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let flushTimer: number | undefined;
    const queued: string[] = [];

    const flush = () => {
      flushTimer = undefined;
      if (!queued.length) return;
      const types = queued.splice(0);
      invalidateAll();
      if (types.some((t) => SESSION_EVENTS.has(t))) refreshSession();
    };
    const queueChange = (type: string) => {
      queued.push(type);
      if (flushTimer !== undefined) clearTimeout(flushTimer);
      flushTimer = window.setTimeout(flush, 220);
    };

    const connect = () => {
      if (closed || authRejected) return;
      socket = new WebSocket(wsUrl("/ws/invalidate"));
      socket.onopen = () => {
        attempt = 0;
        const token = credentials.session();
        const till = credentials.terminal();
        socket?.send(JSON.stringify({
          type: "auth",
          ...(token ? { token } : {}),
          ...(till?.token ? { terminalToken: till.token } : {}),
        }));
      };
      socket.onmessage = (e) => {
        let message: unknown;
        try { message = JSON.parse(String(e.data)); } catch { return; }
        if (!isRecord(message)) return;
        if (message.type === "authenticated") {
          if (hasConnected) queueChange("sync"); // catch up on notices missed while offline
          hasConnected = true;
          return;
        }
        if (message.type !== "change" || !isRecord(message.event)) return;
        const event = message.event;
        if (orgId && typeof event.orgId === "string" && event.orgId !== orgId) return;
        queueChange(typeof event.type === "string" ? event.type : "general");
      };
      socket.onclose = (e) => {
        if (closed) return;
        socket = null;
        if (e.code === 4401 || e.code === 4403 || e.code === 4408) { authRejected = true; return; }
        hasConnected = false;
        const delay = Math.min(10_000, 500 * 2 ** attempt++);
        reconnectTimer = window.setTimeout(connect, delay);
      };
      socket.onerror = () => undefined;
    };

    connect();
    return () => {
      closed = true;
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
      if (flushTimer !== undefined) clearTimeout(flushTimer);
      socket?.close();
    };
  }, [ready, signedIn, user.id, posUser?.id, orgId, terminalToken]);

  return <>{children}</>;
}
