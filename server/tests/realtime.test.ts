/** Live change notices: mutation-only emits, org isolation, WebSocket auth. */
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import type { Db } from "../src/core/db.js";
import { AppError } from "../src/core/errors.js";
import { dispatch } from "../src/http/router.js";
import { router } from "../src/http/routes.js";
import { attachChangeRelay } from "../src/realtime/change-relay.js";
import { emitChange, onChange, type ChangeEvent } from "../src/realtime/changes.js";
import { createSqliteDb } from "./sqlite.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
let db: Db;
let ip = 0;
const S: Record<string, any> = {};

async function call(method: string, path: string, o: { token?: string; till?: string; body?: unknown } = {}): Promise<any> {
  const [p, qs] = path.split("?");
  const m = router.match(method, p!);
  if (!m) throw new Error(`no route ${method} ${p}`);
  return dispatch(m.route, {
    db, body: o.body ?? {}, params: m.params,
    query: Object.fromEntries(new URLSearchParams(qs ?? "")),
    token: o.token, terminalToken: "till" in o ? o.till : S.till,
  }, `ip${ip++}`);
}

const opened = (ws: WebSocket) => new Promise<void>((resolve, reject) => { ws.once("open", () => resolve()); ws.once("error", reject); });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (raw: { toString(): string }) => JSON.parse(raw.toString());

function authenticate(ws: WebSocket, auth: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const onMessage = (raw: { toString(): string }) => {
      if (text(raw).type !== "authenticated") return;
      cleanup();
      resolve();
    };
    const onClose = (code: number) => { cleanup(); reject(new Error(`closed ${code}`)); };
    const cleanup = () => { ws.off("message", onMessage); ws.off("close", onClose); };
    ws.on("message", onMessage);
    ws.on("close", onClose);
    ws.send(JSON.stringify({ type: "auth", ...auth }));
  });
}

before(async () => {
  db = await createSqliteDb();
  const owner = await call("post", "/auth/signup", { body: { email: "realtime-owner@example.com", password: "owner-pass-1", fullName: "Real Time Owner" } });
  S.token = owner.token;
  await call("post", "/business", { token: S.token, body: { name: "Realtime Shop", branch_name: "Main", branch_code: "RTM" } });
  const me = await call("get", "/me", { token: S.token });
  S.org = me.business.id;
  S.branch = me.branchIds[0];
  const till = await call("post", "/terminals", { token: S.token, body: { name: "Till 1", branchId: S.branch } });
  S.till = till.token;

  const other = await call("post", "/auth/signup", { body: { email: "realtime-other@example.com", password: "other-pass-1", fullName: "Other Owner" } });
  await call("post", "/business", { token: other.token, body: { name: "Other Shop", branch_name: "Main", branch_code: "OTH" } });
  S.otherToken = other.token;
});

describe("real-time change notices", () => {
  it("broadcasts only after a successful write, with metadata only", async () => {
    const events: ChangeEvent[] = [];
    const off = onChange((e) => { if (e.orgId === S.org) events.push(e); });
    try {
      await call("get", "/me", { token: S.token });
      assert.equal(events.length, 0, "reads must not broadcast");

      await assert.rejects(() => call("post", "/customers", { token: S.token, body: {} }), AppError);
      assert.equal(events.length, 0, "rejected writes must not broadcast");

      await call("post", "/customers", { token: S.token, body: { name: "Live Customer" } });
      assert.equal(events.length, 1);
      assert.equal(events[0]?.type, "customers");
      assert.equal(events[0]?.orgId, S.org);
      assert.deepEqual(Object.keys(events[0]!).sort(), ["at", "orgId", "type"]);
    } finally { off(); }
  });

  it("delivers by business only and authenticates sessions and tills", async () => {
    const server = createServer();
    const relay = attachChangeRelay(server, db);
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as AddressInfo).port;
    const url = `ws://127.0.0.1:${port}/ws/invalidate`;
    const sockets: WebSocket[] = [];
    try {
      const owner = new WebSocket(url);
      const other = new WebSocket(url);
      const till = new WebSocket(url);
      sockets.push(owner, other, till);
      await Promise.all([opened(owner), opened(other), opened(till)]);
      await Promise.all([
        authenticate(owner, { token: S.token }),
        authenticate(other, { token: S.otherToken }),
        authenticate(till, { terminalToken: S.till }),
      ]);
      const ownerGot: unknown[] = [], otherGot: unknown[] = [], tillGot: unknown[] = [];
      owner.on("message", (raw) => ownerGot.push(text(raw)));
      other.on("message", (raw) => otherGot.push(text(raw)));
      till.on("message", (raw) => tillGot.push(text(raw)));

      emitChange({ orgId: S.org, type: "sales", branchId: S.branch });
      await sleep(120);
      assert.equal(ownerGot.length, 1);
      assert.equal(tillGot.length, 1);
      assert.equal(otherGot.length, 0);
      assert.deepEqual(ownerGot[0], {
        type: "change",
        event: { orgId: S.org, type: "sales", at: (ownerGot[0] as any).event.at, branchId: S.branch },
      });

      const bad = new WebSocket(url);
      sockets.push(bad);
      await opened(bad);
      bad.send(JSON.stringify({ type: "auth", token: "not-a-session" }));
      const code = await new Promise<number>((resolve) => bad.once("close", resolve));
      assert.equal(code, 4401);
    } finally {
      relay.close();
      for (const ws of sockets) ws.terminate();
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
