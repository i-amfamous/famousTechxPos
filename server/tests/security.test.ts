/** Regression tests for go-live hardening: malformed URLs, privilege escalation, over-receiving and numeric guards. */
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "../src/core/db.js";
import { AppError } from "../src/core/errors.js";
import { n } from "../src/core/values.js";
import { dispatch } from "../src/http/router.js";
import { router } from "../src/http/routes.js";
import { createSqliteDb } from "./sqlite.js";

let db: Db;
let ip = 0;
/* eslint-disable @typescript-eslint/no-explicit-any */
async function call(method: string, path: string, o: { token?: string; body?: unknown } = {}): Promise<{ status: number; body: any }> {
  const [p, qs] = path.split("?");
  const m = router.match(method, p!);
  if (!m) throw new Error(`no route ${method} ${p}`);
  try {
    const body = await dispatch(m.route, { db, body: o.body ?? {}, params: m.params, query: Object.fromEntries(new URLSearchParams(qs ?? "")), token: o.token }, `sec${ip++}`);
    return { status: 200, body: JSON.parse(JSON.stringify(body)) };
  } catch (e) {
    if (e instanceof AppError) return { status: e.status, body: { error: e.code, message: e.message, ...e.extra } };
    throw e;
  }
}
const ok = async (method: string, path: string, o: Parameters<typeof call>[2] = {}) => {
  const r = await call(method, path, o);
  assert.equal(r.status, 200, `${method} ${path} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const err = async (code: string, method: string, path: string, o: Parameters<typeof call>[2] = {}) => {
  const r = await call(method, path, o);
  assert.equal(r.body?.error, code, `${method} ${path} expected ${code}, got ${r.status} ${JSON.stringify(r.body)}`);
  return r;
};

const S: Record<string, any> = {};

before(async () => {
  db = await createSqliteDb();
  const s = await ok("post", "/auth/signup", { body: { email: "sec-owner@example.com", password: "owner-pass-1", fullName: "Sec Owner" } });
  S.owner = s.token;
  await ok("post", "/business", { token: S.owner, body: { name: "Sec Shop", branch_name: "Main", branch_code: "MAIN" } });
  const me = await ok("get", "/me", { token: S.owner });
  S.branch = me.branchIds[0];
  S.ownerId = me.member.id;
  const roles = await ok("get", "/roles", { token: S.owner });
  S.roles = Object.fromEntries(roles.map((r: any) => [r.key, r]));
});

describe("input guards", () => {
  it("treats a malformed URL escape as no route instead of crashing", () => {
    assert.equal(router.match("get", "/sales/%ZZ"), null);
    assert.equal(router.match("get", "/sales/%"), null);
    assert.ok(router.match("get", "/sales/sale-1"));
  });

  it("maps non-finite numbers to zero so they can't bypass amount checks", () => {
    assert.equal(n(NaN), 0);
    assert.equal(n(Infinity), 0);
    assert.equal(n(-Infinity), 0);
    assert.equal(n("12.5"), 12.5);
  });
});

describe("privilege boundaries", () => {
  it("stops a manager granting a stronger role or another branch", async () => {
    const mgr = await ok("post", "/employees", { token: S.owner, body: {
      fullName: "Sec Manager", phone: "0245550001", roleId: S.roles.manager.id, branchIds: [S.branch], inviteMethod: "temp_password",
    } });
    const mgrSession = await ok("post", "/auth/login", { body: { identifier: "+233 24 555 0001", password: mgr.tempPassword } });
    await ok("post", "/me/password", { token: mgrSession.token, body: { next: "mgr-pass-1" } });
    const cashier = await ok("post", "/employees", { token: S.owner, body: {
      fullName: "Sec Cashier", phone: "0245550002", roleId: S.roles.cashier.id, branchIds: [S.branch], inviteMethod: "temp_password",
    } });
    const stronger = await ok("post", "/roles", { token: S.owner, body: { name: "Settings admin", permissions: ["settings.manage"] } });
    const access = { overrides: [], branchIds: [S.branch] };

    await err("role_not_allowed", "put", `/employees/${cashier.memberId}/access`, {
      token: mgrSession.token, body: { ...access, roleId: stronger.id },
    });
    const branch2 = await ok("post", "/branches", { token: S.owner, body: { name: "Second", code: "SEC2" } });
    await err("branch_not_allowed", "put", `/employees/${cashier.memberId}/access`, {
      token: mgrSession.token, body: { ...access, roleId: S.roles.manager.id, branchIds: [S.branch, branch2.id] },
    });
    await err("cannot_assign_owner", "post", "/employees", {
      token: mgrSession.token, body: { fullName: "X", phone: "0245550003", roleId: S.roles.owner.id, branchIds: [S.branch], inviteMethod: "temp_password" },
    });
  });
});

describe("purchase receiving", () => {
  it("aggregates duplicate lines but refuses to receive more than outstanding", async () => {
    const sup = await ok("post", "/suppliers", { token: S.owner, body: { name: "Sec Supplier", phone: "0244000000" } });
    const p = await ok("post", "/products", { token: S.owner, body: {
      branchId: S.branch, name: "Sec Product", sku: "SEC-1", costPrice: 10, sellingPrice: 20, openingStock: 0,
    } });
    const po = await ok("post", "/purchase-orders", { token: S.owner, body: {
      supplierId: sup.id, branchId: S.branch, place: true, lines: [{ productId: p.id, quantity: 5, unitCost: 10 }],
    } });
    const [order] = await ok("get", "/purchase-orders", { token: S.owner });
    const item = order.lines[0].id;

    // Three lines for the same item add up to 7, above the ordered 5 — must be rejected.
    await err("over_received", "post", `/purchase-orders/${po.id}/receive`, {
      token: S.owner, body: { lines: [{ itemId: item, quantity: 3 }, { itemId: item, quantity: 2 }, { itemId: item, quantity: 2 }] },
    });
    // Split across two lines of the same item is fine when it adds up to 5.
    await ok("post", `/purchase-orders/${po.id}/receive`, {
      token: S.owner, body: { lines: [{ itemId: item, quantity: 3 }, { itemId: item, quantity: 2 }] },
    });
    assert.equal((await ok("get", `/products?branchId=${S.branch}`, { token: S.owner })).find((x: any) => x.id === p.id).stock, 5);
    assert.equal((await ok("get", "/purchase-orders", { token: S.owner }))[0].status, "received");
    await err("not_receivable", "post", `/purchase-orders/${po.id}/receive`, { token: S.owner, body: { lines: [{ itemId: item, quantity: 1 }] } });
  });
});
