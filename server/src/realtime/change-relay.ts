/**
 * Authenticated push channel for data-change notices.
 *   ws(s)://<server>/ws/invalidate
 *
 * The first message must be `{ type: "auth", token?, terminalToken? }`. A signed-in
 * session or a registered till is required. Only orgId and a broad category travel
 * over the socket, and subscribers only see events from their own business.
 */
import type { Server } from "node:http";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { loadActor, readSession, assertSessionDevice } from "../auth/sessions.js";
import { sha256 } from "../auth/crypto.js";
import { one, type Db } from "../core/db.js";
import { onChange, type ChangeEvent } from "./changes.js";

interface Client {
  ws: WebSocket;
  orgId: string;
  branchIds: Set<string> | null;
}

interface Identity {
  orgId: string;
  branchIds: Set<string> | null;
}

function parseMessage(raw: RawData): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw.toString());
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

export function attachChangeRelay(server: Server, db: Db) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });
  const clients = new Set<Client>();
  const sockets = new Set<WebSocket>();

  const unsubscribe = onChange((event: ChangeEvent) => {
    const text = JSON.stringify({ type: "change", event });
    for (const client of clients) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;
      if (client.orgId !== event.orgId) continue;
      if (event.branchId && client.branchIds && client.branchIds.size && !client.branchIds.has(event.branchId)) continue;
      try { client.ws.send(text); }
      catch { client.ws.terminate(); }
    }
  });

  const identify = async (token: unknown, terminalToken: unknown): Promise<Identity> => {
    const bearer = typeof token === "string" && token ? token : null;
    const till = typeof terminalToken === "string" && terminalToken ? terminalToken : null;
    if (bearer) {
      const session = await readSession(db, bearer);
      await assertSessionDevice(db, session, till ?? undefined);
      const actor = await loadActor(db, session);
      const orgId = actor?.orgId ?? session.orgId;
      if (!orgId) throw new Error("No business is linked to this session.");
      return { orgId, branchIds: actor?.branchIds ?? null };
    }
    if (till) {
      const row = await one(db, "SELECT organization_id, branch_id FROM pos_terminals WHERE token_hash = ? AND status = 'active'", [sha256(till)]);
      if (!row?.organization_id) throw new Error("This till is no longer registered.");
      const branchIds = row.branch_id ? new Set([String(row.branch_id)]) : null;
      return { orgId: String(row.organization_id), branchIds };
    }
    throw new Error("Sign in or unlock a till first.");
  };

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (!/^(\/api)?\/ws\/invalidate$/.test(url.pathname)) return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      sockets.add(ws);
      let settled = false;
      let timer: NodeJS.Timeout | undefined;
      let client: Client | null = null;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        sockets.delete(ws);
        if (client) clients.delete(client);
      };
      const reject = (code: number, reason: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        ws.close(code, reason.slice(0, 100));
      };
      const onMessage = (raw: RawData) => {
        if (settled) return;
        const msg = parseMessage(raw);
        if (msg?.type !== "auth") { reject(4400, "auth required"); return; }
        void identify(msg.token, msg.terminalToken)
          .then((identity) => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            client = { ws, orgId: identity.orgId, branchIds: identity.branchIds };
            clients.add(client);
            ws.off("message", onMessage);
            ws.send(JSON.stringify({ type: "authenticated" }));
          })
          .catch(() => reject(4401, "not authorized"));
      };

      timer = setTimeout(() => reject(4408, "auth timed out"), 8_000);
      ws.on("message", onMessage);
      ws.on("error", () => undefined);
      ws.on("close", cleanup);
    });
  });

  const heartbeat = setInterval(() => {
    for (const ws of sockets) if (ws.readyState === WebSocket.OPEN) ws.ping();
  }, 25_000);
  heartbeat.unref?.();

  return {
    /** Close push connections on shutdown so redeploys don't leave browsers hanging. */
    close() {
      unsubscribe();
      clearInterval(heartbeat);
      for (const ws of sockets) ws.terminate();
      sockets.clear();
      clients.clear();
      wss.close();
    },
  };
}
