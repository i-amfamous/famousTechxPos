/**
 * Phone-as-scanner relay. The till shows a QR with a random session id; the phone opens
 * /scan/<id>, connects here and sends scans; the till (same session) receives them.
 *   ws(s)://<server>/ws/scan?session=<id>&role=till|phone
 * Messages are small JSON objects relayed to the other side(s) of the same session.
 */
import type { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";

const rooms = new Map<string, Set<WebSocket>>();
const SCAN_PATH = /^(\/api)?\/ws\/scan$/;
const SESSION = /^[A-Za-z0-9_-]{12,64}$/;

/** True for every scanner route, including one with a bad session id. */
export function isScanPath(url: URL): boolean {
  return SCAN_PATH.test(url.pathname);
}

export function attachScanRelay(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://x");
    // Leave other upgrades alone so the change relay can accept /ws/invalidate.
    if (!isScanPath(url)) return;
    const session = url.searchParams.get("session") ?? "";
    if (!SESSION.test(session)) {
      socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      let room = rooms.get(session);
      if (!room) { room = new Set(); rooms.set(session, room); }
      if (room.size >= 8) { ws.close(1013, "room full"); return; }
      room.add(ws);
      const role = url.searchParams.get("role") === "phone" ? "phone" : "till";
      const broadcast = (msg: string) => { for (const peer of room!) if (peer !== ws && peer.readyState === WebSocket.OPEN) peer.send(msg); };
      broadcast(JSON.stringify({ type: "peer", role, state: "joined" }));

      let count = 0;
      const window = setInterval(() => { count = 0; }, 10_000);
      ws.on("message", (data) => {
        if (++count > 100) return; // ~10 scans/second is plenty
        const text = data.toString();
        try { JSON.parse(text); } catch { return; }
        broadcast(text);
      });
      const alive = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.ping(); }, 25_000);
      ws.on("close", () => {
        clearInterval(window); clearInterval(alive);
        room!.delete(ws);
        broadcast(JSON.stringify({ type: "peer", role, state: "left" }));
        if (!room!.size) rooms.delete(session);
      });
    });
  });

  return {
    /** Close scanner connections on shutdown so redeploys don't leave phones hanging. */
    close() {
      for (const ws of wss.clients) ws.terminate();
      rooms.clear();
      wss.close();
    },
  };
}
