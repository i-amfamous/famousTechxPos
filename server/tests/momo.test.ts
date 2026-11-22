/** Mobile money routing: detect the network from the customer's number and never fail a sale. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectNetwork, normalizePhone, requestMomoPayment } from "../src/modules/payments/momo.service.js";

describe("mobile money routing", () => {
  it("normalises Ghana numbers from common formats", () => {
    assert.equal(normalizePhone("024 123 4567"), "0241234567");
    assert.equal(normalizePhone("+233241234567"), "0241234567");
    assert.equal(normalizePhone("241234567"), "0241234567");
  });

  it("detects MTN, Telecel and AirtelTigo from the number prefix", () => {
    assert.equal(detectNetwork("0241234567"), "MTN");
    assert.equal(detectNetwork("0591234567"), "MTN");
    assert.equal(detectNetwork("0201234567"), "Telecel");
    assert.equal(detectNetwork("0551234567"), "Telecel");
    assert.equal(detectNetwork("0271234567"), "AT");
    assert.equal(detectNetwork("0571234567"), "AT");
    assert.equal(detectNetwork("0302014455"), "Unknown");
  });

  it("falls back to pending instead of throwing when no provider is configured", async () => {
    for (const network of ["MTN", "Telecel", "AT", "Unknown"] as const) {
      const result = await requestMomoPayment({ network, phone: "0241234567", amount: 10, externalId: "sale-1" });
      assert.equal(result.sent, false, `${network} should not claim a request was sent`);
      assert.match(result.message, /recorded as pending/i);
    }
  });
});
