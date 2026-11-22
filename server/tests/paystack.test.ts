/** Paystack Ghana Mobile Money: payload, signatures, network routing and webhook confirmation. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const SECRET = "sk_test_unit_secret";
const PUBLIC = "pk_test_unit_public";
process.env.PAYSTACK_SECRET_KEY = SECRET;
process.env.PAYSTACK_PUBLIC_KEY = PUBLIC;
process.env.PAYSTACK_CALLBACK_URL = "https://example.com/payment/callback";

const { initializePaystackPayment, initializePaystackInline, verifyPaystackSignature } = await import("../src/modules/payments/paystack.service.js");
const { handlePaystackWebhook } = await import("../src/modules/payments/paystack-webhook.service.js");
const { requestMomoPayment, detectNetwork } = await import("../src/modules/payments/momo.service.js");
const { checkout } = await import("../src/modules/sales/checkout.service.js");
const { ALL_PERMS } = await import("../src/auth/permission-catalogue.js");
const { createSqliteDb } = await import("./sqlite.js");

const sign = (raw: Buffer) => createHmac("sha512", SECRET).update(raw).digest("hex");

function stubFetch(result: Record<string, unknown>) {
  const original = globalThis.fetch;
  const captured: { url?: string; headers?: Record<string, string>; body?: Record<string, unknown> } = {};
  globalThis.fetch = async (url, init) => {
    const opts = init as RequestInit;
    captured.url = String(url);
    captured.headers = opts.headers as Record<string, string>;
    captured.body = opts.body ? JSON.parse(String(opts.body)) as Record<string, unknown> : undefined;
    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  return { restore: () => { globalThis.fetch = original; }, captured };
}

const success = {
  status: true,
  message: "Authorization Fetched",
  data: { reference: "FTX-abc", authorization_url: "https://checkout.paystack.com/abc" },
};

/** Minimal till, shift and product so checkout can be exercised without a session. */
async function saleFixture() {
  const db = await createSqliteDb();
  const ts = "2026-01-01 00:00:00.000";
  await db.run("INSERT INTO businesses (id, name, owner_user_id, created_at, updated_at) VALUES (?,?,?,?,?)", ["org-1", "Test Shop", "user-1", ts, ts]);
  await db.run("INSERT INTO branches (id, organization_id, name, code, created_at) VALUES (?,?,?,?,?)", ["branch-1", "org-1", "Main", "MAIN", ts]);
  await db.run("INSERT INTO pos_terminals (id, organization_id, branch_id, name, code, token_hash, created_at) VALUES (?,?,?,?,?,?,?)", ["term-1", "org-1", "branch-1", "Till 1", "T1", "a".repeat(64), ts]);
  await db.run("INSERT INTO shifts (id, organization_id, branch_id, terminal_id, member_id, opened_at) VALUES (?,?,?,?,?,?)", ["shift-1", "org-1", "branch-1", "term-1", "member-1", ts]);
  await db.run("INSERT INTO products (id, organization_id, name, sku, cost_price, selling_price, unit, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)", ["product-1", "org-1", "Test item", "TEST-1", 5, 12.5, "job", ts, ts]);
  const actor = {
    sessionId: "session-1", userId: "user-1", orgId: "org-1", memberId: "member-1", isOwner: true, roleId: "role-1",
    perms: new Set(ALL_PERMS), branchIds: new Set(["branch-1"]), method: "password", terminalId: "term-1", member: {}, role: {},
  } as unknown as Parameters<typeof checkout>[1];
  return { db, actor };
}

const inlineCheckout = (paystackReference: string) => ({
  terminalId: "term-1", idempotencyKey: `inline-${paystackReference}`,
  lines: [{ productId: "product-1", quantity: 1 }],
  payments: [{ method: "momo", amount: 12.5, phone: "0241234567", paystackReference }],
});

describe("Paystack mobile money", () => {
  it("sends pesewas, GHS and the customer number to Paystack", async () => {
    const stub = stubFetch(success);
    try {
      const out = await initializePaystackPayment({ phone: "024 123 4567", amount: 12.5, externalId: "sale-1" });
      assert.equal(out.reference, "FTX-abc");
      assert.equal(stub.captured.url, "https://api.paystack.co/transaction/initialize");
      assert.match(String(stub.captured.headers?.Authorization), /^Bearer sk_test_/);
      assert.equal(stub.captured.body?.amount, 1250);
      assert.equal(stub.captured.body?.currency, "GHS");
      assert.equal(stub.captured.body?.mobile_number, "0241234567");
      assert.equal((stub.captured.body?.metadata as Record<string, string>).network, "MTN");
      assert.equal((stub.captured.body?.metadata as Record<string, string>).saleId, "sale-1");
    } finally { stub.restore(); }
  });

  it("routes both MTN and Telecel numbers through Paystack", async () => {
    const stub = stubFetch(success);
    try {
      for (const phone of ["0241234567", "0201234567"]) {
        const out = await requestMomoPayment({ network: detectNetwork(phone), phone, amount: 5, externalId: "sale-2" });
        assert.equal(out.provider, "paystack");
        assert.equal(out.sent, true);
        assert.equal(out.reference, "FTX-abc");
        assert.equal(stub.captured.body?.mobile_number, phone);
      }
    } finally { stub.restore(); }
  });

  it("verifies the raw-body HMAC and rejects tampering", () => {
    const raw = Buffer.from(JSON.stringify({ event: "charge.success", data: { reference: "FTX-abc" } }));
    assert.equal(verifyPaystackSignature(raw, sign(raw)), true);
    assert.equal(verifyPaystackSignature(Buffer.from("tampered"), sign(raw)), false);
    assert.equal(verifyPaystackSignature(raw, "not-a-signature"), false);
  });

  it("confirms a pending tender once and ignores replayed webhooks", async () => {
    const db = await createSqliteDb();
    await db.run(`INSERT INTO momo_requests (id, organization_id, sale_id, payment_id, network, phone, amount, provider, provider_reference, status, message, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, ["req-1", "org-1", "sale-1", "pay-1", "MTN", "0241234567", 12.5, "paystack", "FTX-abc", "sent", "Awaiting approval", "2026-01-01 00:00:00.000"]);
    await db.run(`INSERT INTO payments (id, organization_id, sale_id, method, amount, status, provider_reference, recorded_by, created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`, ["pay-1", "org-1", "sale-1", "momo", 12.5, "sent", "MTN 0241234567", "actor-1", "2026-01-01 00:00:00.000"]);

    const body = { event: "charge.success", data: { status: "success", currency: "GHS", reference: "FTX-abc", amount: 1250 } };
    const raw = Buffer.from(JSON.stringify(body));
    await assert.rejects(
      () => handlePaystackWebhook({ db, body, rawBody: raw, signature: "bad" }),
      /Invalid Paystack signature/,
    );

    const first = await handlePaystackWebhook({ db, body, rawBody: raw, signature: sign(raw) });
    assert.equal(first.paid, true);
    const payment = await db.all("SELECT status FROM payments WHERE id = 'pay-1'");
    assert.equal(payment[0]?.status, "paid");

    const replay = await handlePaystackWebhook({ db, body, rawBody: raw, signature: sign(raw) });
    assert.equal(replay.ignored, true);
    await db.close();
  });

  it("starts Inline with pesewas, GHS and no request-to-pay number", async () => {
    const stub = stubFetch({ status: true, data: { reference: "FTX-inline" } });
    try {
      const out = await initializePaystackInline({ amount: 12.5, phone: "024 123 4567" });
      assert.equal(out.reference, "FTX-inline");
      assert.equal(out.publicKey, PUBLIC);
      assert.equal(out.email, "0241234567@famoustexhpos.com");
      assert.equal(stub.captured.body?.amount, 1250);
      assert.equal(stub.captured.body?.currency, "GHS");
      assert.deepEqual(stub.captured.body?.channels, ["mobile_money"]);
      assert.equal(stub.captured.body?.mobile_number, undefined);
      assert.equal(stub.captured.body?.callback_url, undefined);
    } finally { stub.restore(); }
  });

  it("verifies an Inline reference before saving and records the tender as paid", async () => {
    const { db, actor } = await saleFixture();
    const original = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ data: { status: "success", amount: 1250 } }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    try {
      const receipt = await checkout(db, actor, inlineCheckout("FTX-inline"));
      assert.equal(calls.length, 1);
      assert.match(calls[0] ?? "", /\/transaction\/verify\/FTX-inline$/);
      assert.equal(receipt.payments[0]?.status, "paid");

      const pays = await db.all("SELECT status, provider_reference FROM payments WHERE sale_id = ?", [receipt.saleId]);
      assert.equal(pays[0]?.status, "paid");
      assert.equal(pays[0]?.provider_reference, "Paystack FTX-inline");
      const requests = await db.all("SELECT status, provider_reference FROM momo_requests WHERE sale_id = ?", [receipt.saleId]);
      assert.equal(requests.length, 1);
      assert.equal(requests[0]?.status, "paid");
      assert.equal(requests[0]?.provider_reference, "FTX-inline");
    } finally { globalThis.fetch = original; await db.close(); }
  });

  it("refuses to save a sale when Paystack hasn't confirmed the Inline payment", async () => {
    const { db, actor } = await saleFixture();
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ data: { status: "pending", amount: 1250 } }), { status: 200, headers: { "Content-Type": "application/json" } });
    try {
      await assert.rejects(() => checkout(db, actor, inlineCheckout("FTX-pending")), (e: { code?: string }) => e.code === "paystack_not_paid");
      assert.equal((await db.all("SELECT id FROM sales")).length, 0);
    } finally { globalThis.fetch = original; await db.close(); }
  });
});
