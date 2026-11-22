/** Paystack Ghana Mobile Money: payload, signatures, network routing and webhook confirmation. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const SECRET = "sk_test_unit_secret";
process.env.PAYSTACK_SECRET_KEY = SECRET;
process.env.PAYSTACK_CALLBACK_URL = "https://example.com/payment/callback";

const { initializePaystackPayment, verifyPaystackSignature } = await import("../src/modules/payments/paystack.service.js");
const { handlePaystackWebhook } = await import("../src/modules/payments/paystack-webhook.service.js");
const { requestMomoPayment, detectNetwork } = await import("../src/modules/payments/momo.service.js");
const { createSqliteDb } = await import("./sqlite.js");

const sign = (raw: Buffer) => createHmac("sha512", SECRET).update(raw).digest("hex");

function stubFetch(result: Record<string, unknown>) {
  const original = globalThis.fetch;
  const captured: { url?: string; headers?: Record<string, string>; body?: Record<string, unknown> } = {};
  globalThis.fetch = async (url, init) => {
    const opts = init as RequestInit;
    captured.url = String(url);
    captured.headers = opts.headers as Record<string, string>;
    captured.body = JSON.parse(String(opts.body));
    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  return { restore: () => { globalThis.fetch = original; }, captured };
}

const success = {
  status: true,
  message: "Authorization Fetched",
  data: { reference: "FTX-abc", authorization_url: "https://checkout.paystack.com/abc" },
};

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
});
