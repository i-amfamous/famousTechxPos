/**
 * Transport between a paired phone and this computer.
 *  - Live: the API server's WebSocket relay (`/ws/scan?session=…`); the random session id is the secret.
 *  - Demo: BroadcastChannel (works between tabs of the same browser, for testing).
 * Reconnects automatically if the connection drops (phones sleep, Wi-Fi hiccups).
 */
import { DEMO, wsUrl } from "@/lib/http";

export type ScanMessage =
  | { type: "hello"; device: string }
  | { type: "scan"; code: string; id: string }
  | { type: "ack"; id: string; ok: boolean; label: string }
  | { type: "bye" }
  /** Sent by the relay when the other side joins or leaves the room. */
  | { type: "peer"; role: "till" | "phone"; state: "joined" | "left" };

export interface ScanChannel {
  send: (m: ScanMessage) => void;
  close: () => void;
}

const MESSAGE_TYPES = new Set<ScanMessage["type"]>(["hello", "scan", "ack", "bye", "peer"]);
const isScanMessage = (m: unknown): m is ScanMessage => !!m && typeof m === "object" && MESSAGE_TYPES.has((m as { type: ScanMessage["type"] }).type);

export function openScanChannel(sessionId: string, onMessage: (m: ScanMessage) => void, onConnection?: (connected: boolean) => void, role: "till" | "phone" = "till"): ScanChannel {
  return DEMO ? openBroadcastChannel(sessionId, onMessage, onConnection) : openSocket(sessionId, role, onMessage, onConnection);
}

function openBroadcastChannel(sessionId: string, onMessage: (m: ScanMessage) => void, onConnection?: (connected: boolean) => void): ScanChannel {
  const bc = new BroadcastChannel(`ftx-scan-${sessionId}`);
  let closed = false;
  bc.onmessage = (e) => { if (isScanMessage(e.data)) onMessage(e.data); };
  setTimeout(() => { if (!closed) onConnection?.(true); }, 0);
  return {
    send: (m) => { if (!closed) bc.postMessage(m); },
    close: () => { closed = true; bc.close(); },
  };
}

function openSocket(sessionId: string, role: "till" | "phone", onMessage: (m: ScanMessage) => void, onConnection?: (connected: boolean) => void): ScanChannel {
  const url = wsUrl(`/ws/scan?session=${encodeURIComponent(sessionId)}&role=${role}`);
  let socket: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  const outbox: string[] = [];

  const connect = () => {
    if (closed) return;
    socket = new WebSocket(url);
    socket.onopen = () => {
      attempt = 0;
      while (outbox.length) socket!.send(outbox.shift()!);
      onConnection?.(true); // every reconnect, not just the first — the phone must re-announce itself
    };
    socket.onmessage = (e) => {
      try { const m: unknown = JSON.parse(String(e.data)); if (isScanMessage(m)) onMessage(m); } catch { /* ignore junk */ }
    };
    socket.onclose = () => {
      if (closed) return;
      onConnection?.(false);
      const delay = Math.min(10_000, 500 * 2 ** attempt++); // 0.5s, 1s, 2s … up to 10s
      setTimeout(connect, delay);
    };
  };
  connect();

  return {
    send: (m) => {
      if (closed) return;
      const text = JSON.stringify(m);
      if (socket?.readyState === WebSocket.OPEN) socket.send(text);
      else if (outbox.length < 50) outbox.push(text);
    },
    close: () => { closed = true; socket?.close(); },
  };
}
