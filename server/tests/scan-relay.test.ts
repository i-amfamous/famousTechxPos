/** The phone-as-scanner WebSocket relay, over a real HTTP server. */
import { it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import { attachScanRelay } from "../src/realtime/scan-relay.js";

const opened = (ws: WebSocket) => new Promise((resolve, reject) => { ws.on("open", resolve); ws.on("error", reject); });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

it("relays scans from the phone to the till in the same session only", async () => {
  const server = createServer();
  attachScanRelay(server);
  await new Promise<void>((r) => server.listen(0, r));
  const { port } = server.address() as AddressInfo;
  const url = (session: string, role: string) => `ws://127.0.0.1:${port}/ws/scan?session=${session}&role=${role}`;

  const till = new WebSocket(url("session-aaaaaaaa", "till"));
  const otherTill = new WebSocket(url("session-bbbbbbbb", "till"));
  await Promise.all([opened(till), opened(otherTill)]);
  const tillGot: unknown[] = [], otherGot: unknown[] = [];
  till.on("message", (d) => tillGot.push(JSON.parse(d.toString())));
  otherTill.on("message", (d) => otherGot.push(JSON.parse(d.toString())));

  const phone = new WebSocket(url("session-aaaaaaaa", "phone"));
  await opened(phone);
  phone.send(JSON.stringify({ type: "scan", code: "8806095300011" }));
  phone.send("not json"); // ignored
  await sleep(150);

  assert.deepEqual(tillGot, [{ type: "peer", role: "phone", state: "joined" }, { type: "scan", code: "8806095300011" }]);
  assert.deepEqual(otherGot, []);
  await assert.rejects(opened(new WebSocket(`ws://127.0.0.1:${port}/ws/scan?session=short`)));

  for (const ws of [till, otherTill, phone]) ws.close();
  server.close();
});
