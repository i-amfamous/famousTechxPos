/**
 * End-to-end tests of the API (route table → services → SQL) on an in-memory database.
 *   npm test
 */
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { nowSql } from "../src/core/time.js";
import type { Db } from "../src/core/db.js";
import { AppError } from "../src/core/errors.js";
import { captureMail, outbox } from "../src/core/mail.js";
import { dispatch } from "../src/http/router.js";
import { router } from "../src/http/routes.js";
import { barcodeProviders } from "../src/modules/catalogue/barcode.service.js";
import { createSqliteDb } from "./sqlite.js";

let db: Db;
let ip = 0;
/* eslint-disable @typescript-eslint/no-explicit-any */
async function call(method: string, path: string, o: { token?: string; till?: string; body?: unknown } = {}): Promise<{ status: number; body: any }> {
  const [p, qs] = path.split("?");
  const m = router.match(method, p!);
  if (!m) throw new Error(`no route ${method} ${p}`);
  try {
    // Like the website, every request carries this device's till token (once it is a till).
    const terminalToken = "till" in o ? o.till : S.till;
    const body = await dispatch(m.route, { db, body: o.body ?? {}, params: m.params, query: Object.fromEntries(new URLSearchParams(qs ?? "")), token: o.token, terminalToken }, `ip${ip++}`);
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
  captureMail(true);
  barcodeProviders.list = [async (code) => (code === "8806095300011" ? { name: "Samsung Galaxy A15", brand: "Samsung", images: [], source: "stub" } : null)];
});

describe("accounts & business", () => {
  it("signs up, creates a business and loads the session", async () => {
    const s = await ok("post", "/auth/signup", { body: { email: "Owner@FamousTechx.com", password: "owner-pass-1", fullName: "Kwame Mensah" } });
    S.owner = s.token;
    const me0 = await ok("get", "/me", { token: S.owner });
    assert.equal(me0.business, null);
    await err("no_business", "get", "/employees", { token: S.owner });
    await ok("post", "/business", { token: S.owner, body: { name: "Famous TechX", branch_name: "Accra – Osu", branch_code: "OSU", phone: "0302014455" } });
    const me = await ok("get", "/me", { token: S.owner });
    assert.equal(me.business.name, "Famous TechX");
    assert.equal(me.member.isOwner, true);
    assert.ok(me.permissions.includes("settings.manage"));
    S.org = me.business.id;
    S.branch = me.branchIds[0];
    S.ownerId = me.member.id;
    const roles = await ok("get", "/roles", { token: S.owner });
    assert.equal(roles.length, 6);
    S.roles = Object.fromEntries(roles.map((r: any) => [r.key, r]));
    await err("already_in_business", "post", "/business", { token: S.owner, body: { name: "Second" } });
  });

  it("rejects bad credentials the same way and logs in with email", async () => {
    await err("unauthorized", "post", "/auth/login", { body: { identifier: "owner@famoustechx.com", password: "nope-nope" } });
    await err("unauthorized", "post", "/auth/login", { body: { identifier: "nobody@x.com", password: "owner-pass-1" } });
    const s = await ok("post", "/auth/login", { body: { identifier: "OWNER@famoustechx.com", password: "owner-pass-1" } });
    assert.ok(s.token);
  });

  it("adds a second branch", async () => {
    const b = await ok("post", "/branches", { token: S.owner, body: { name: "Kumasi – Adum", code: "KSI" } });
    S.branch2 = b.id;
    assert.equal((await ok("get", "/branches", { token: S.owner })).length, 2);
  });
});

describe("employees, tills and PINs", () => {
  it("creates a cashier with a temporary password who signs in with their phone", async () => {
    const r = await ok("post", "/employees", { token: S.owner, body: { fullName: "Ama Owusu", phone: "024 555 0101", roleId: S.roles.cashier.id, branchIds: [S.branch], inviteMethod: "temp_password" } });
    assert.match(r.tempPassword, /^Ftx-/);
    S.cashierId = r.memberId;
    const s = await ok("post", "/auth/login", { body: { identifier: "+233 24 555 0101", password: r.tempPassword } });
    const me = await ok("get", "/me", { token: s.token });
    assert.equal(me.mustChangePassword, true);
    await ok("post", "/me/password", { token: s.token, body: { next: "cashier-pass-1" } });
    assert.equal((await ok("get", "/me", { token: s.token })).mustChangePassword, false); // this session is kept
  });

  it("invites a manager by email; the link activates them", async () => {
    outbox.length = 0;
    const r = await ok("post", "/employees", { token: S.owner, body: { fullName: "Kofi Boateng", phone: "0205550202", email: "kofi@example.com", roleId: S.roles.manager.id, branchIds: [S.branch, S.branch2], inviteMethod: "email" } });
    S.managerId = r.memberId;
    assert.equal(r.emailed, "kofi@example.com");
    const link = outbox.at(-1)!.text.match(/token=([^&\s]+)/)![1]!;
    const s = await ok("post", "/auth/reset", { body: { token: decodeURIComponent(link), password: "manager-pass-1" } });
    S.managerPw = s.token;
    const me = await ok("get", "/me", { token: S.managerPw });
    assert.equal(me.member.status, "active");
    await err("link_expired", "post", "/auth/reset", { body: { token: decodeURIComponent(link), password: "another-pass" } });
  });

  it("registers a till; roster shows sellers; PIN setup + login; wrong PIN locks", async () => {
    const t = await ok("post", "/terminals", { token: S.owner, body: { name: "Till 1", branchId: S.branch } });
    S.till = t.token; S.tillId = t.terminalId;
    const roster = await ok("get", "/terminal/roster", { till: S.till });
    const names = roster.members.map((m: any) => m.displayName).sort();
    assert.deepEqual(names, ["Ama", "Kofi", "Kwame"]);
    await err("no_pin", "post", "/terminal/pin-login", { till: S.till, body: { memberId: S.cashierId, pin: "4826" } });
    await err("pin_too_simple", "post", "/terminal/pin-setup", { till: S.till, body: { memberId: S.cashierId, password: "cashier-pass-1", pin: "1234" } });
    await err("wrong_password", "post", "/terminal/pin-setup", { till: S.till, body: { memberId: S.cashierId, password: "nope", pin: "4826" } });
    const setup = await ok("post", "/terminal/pin-setup", { till: S.till, body: { memberId: S.cashierId, password: "cashier-pass-1", pin: "4826" } });
    S.cashier = setup.token;
    const me = await ok("get", "/me", { token: S.cashier });
    assert.equal(me.passwordSession, false);
    // manager sets a PIN for approvals
    await ok("post", "/terminal/pin-setup", { till: S.till, body: { memberId: S.managerId, password: "manager-pass-1", pin: "7391" } });
    await err("unauthorized", "get", "/me", { token: S.cashier }); // one person per till: Ama's session ended
    S.cashier = (await ok("post", "/terminal/pin-login", { till: S.till, body: { memberId: S.cashierId, pin: "4826" } })).token;
    const w = await err("wrong", "post", "/terminal/pin-login", { till: S.till, body: { memberId: S.managerId, pin: "0000" } });
    assert.equal(w.body.attemptsLeft, 4);
    await ok("post", "/terminal/pin-login", { till: S.till, body: { memberId: S.managerId, pin: "7391" } }); // resets the counter
    S.cashier = (await ok("post", "/terminal/pin-login", { till: S.till, body: { memberId: S.cashierId, pin: "4826" } })).token;
    await err("unknown_terminal", "get", "/terminal/roster", { till: "bogus" });
  });

  it("PIN sessions can't do admin work and only work on their own till", async () => {
    await err("permission_denied", "post", "/employees", { token: S.cashier, body: {} });
    await err("unauthorized", "get", "/me", { token: S.cashier, till: undefined });
    const other = await ok("post", "/terminals", { token: S.owner, body: { name: "Till 2", branchId: S.branch } });
    await err("unauthorized", "get", "/me", { token: S.cashier, till: other.token });
    assert.equal((await ok("get", "/me", { token: S.cashier })).member.id, S.cashierId);
    const mgrPin = (await ok("post", "/auth/login", { body: { identifier: "kofi@example.com", password: "manager-pass-1" } })).token;
    S.manager = mgrPin;
  });
});

describe("catalogue & stock", () => {
  it("creates products with opening stock and rejects duplicate SKU/barcode", async () => {
    const cat = await ok("post", "/categories", { token: S.owner, body: { name: "Phones" } });
    const p1 = await ok("post", "/products", { token: S.owner, body: { branchId: S.branch, name: "Samsung Galaxy A15", sku: "SAM-A15", barcode: "8806095300011", categoryId: cat.id, costPrice: 1500, sellingPrice: 1999, reorderLevel: 3, openingStock: 5 } });
    const p2 = await ok("post", "/products", { token: S.owner, body: { branchId: S.branch, name: "Tempered Glass", sku: "TG-U", costPrice: 10, sellingPrice: 35, openingStock: 100 } });
    const p3 = await ok("post", "/products", { token: S.owner, body: { branchId: S.branch, name: "Screen repair", sku: "SVC-SCR", unit: "job", costPrice: 0, sellingPrice: 250 } });
    Object.assign(S, { p1: p1.id, p2: p2.id, p3: p3.id });
    await err("duplicate_sku", "post", "/products", { token: S.owner, body: { name: "X", sku: "SAM-A15", costPrice: 1, sellingPrice: 2 } });
    await err("duplicate_barcode", "post", "/products", { token: S.owner, body: { name: "X", sku: "X-1", barcode: "8806095300011", costPrice: 1, sellingPrice: 2 } });
    const list = await ok("get", `/products?branchId=${S.branch}`, { token: S.cashier });
    assert.equal(list.find((p: any) => p.id === S.p1).stock, 5);
    await err("permission_denied", "post", "/products", { token: S.cashier, body: { name: "X", sku: "Y", costPrice: 1, sellingPrice: 2 } });
  });

  it("saves product photos from files and rejects unsafe image values", async () => {
    const photo = `data:image/jpeg;base64,${"a".repeat(120)}`;
    const created = await ok("post", "/products", { token: S.owner, body: { branchId: S.branch, name: "Photo item", sku: "PHOTO-1", costPrice: 1, sellingPrice: 2, imageUrl: photo } });
    const list = await ok("get", `/products?branchId=${S.branch}`, { token: S.owner });
    assert.equal(list.find((p: any) => p.id === created.id).imageUrl, photo);
    await err("invalid_image", "post", "/products", { token: S.owner, body: { name: "Bad photo", sku: "PHOTO-2", costPrice: 1, sellingPrice: 2, imageUrl: "javascript:alert(1)" } });
  });

  it("adjusts and receives stock; blocks removing below zero", async () => {
    await err("insufficient_stock", "post", "/stock/adjust", { token: S.owner, body: { branchId: S.branch, productId: S.p1, mode: "remove", quantity: 50, reason: "Count" } });
    assert.equal((await ok("post", "/stock/adjust", { token: S.owner, body: { branchId: S.branch, productId: S.p1, mode: "set", quantity: 6, reason: "Stock count" } })).quantity, 6);
    assert.equal((await ok("post", "/stock/receive", { token: S.owner, body: { branchId: S.branch, productId: S.p1, quantity: 4, unitCost: 1480, reference: "INV-77" } })).quantity, 10);
    const moves = await ok("get", `/stock/movements?branchId=${S.branch}`, { token: S.owner });
    assert.ok(moves.length >= 4);
  });

  it("looks barcodes up online once, then from cache", async () => {
    const r = await ok("get", "/barcode/8806095300011", { token: S.owner });
    assert.equal(r.product.name, "Samsung Galaxy A15");
    barcodeProviders.list = [];
    assert.equal((await ok("get", "/barcode/8806095300011", { token: S.owner })).cached, true);
    assert.equal((await ok("get", "/barcode/123", { token: S.owner })).found, false);
  });
});

describe("selling", () => {
  it("requires an open shift, then sells (idempotently) with change", async () => {
    const sale = { terminalId: S.tillId, idempotencyKey: "k-1", lines: [{ productId: S.p1, quantity: 1 }, { productId: S.p2, quantity: 2 }], payments: [{ method: "cash", amount: 2100 }] };
    await err("shift_required", "post", "/checkout", { token: S.cashier, body: sale });
    S.shift = (await ok("post", "/shifts", { token: S.cashier, body: { terminalId: S.tillId, openingFloat: 200 } })).shiftId;
    assert.equal((await ok("post", "/shifts", { token: S.cashier, body: { terminalId: S.tillId, openingFloat: 200 } })).shiftId, S.shift);
    const r = await ok("post", "/checkout", { token: S.cashier, body: sale });
    assert.equal(r.total, 2069);
    assert.equal(r.change, 31);
    assert.match(r.receiptNumber, /^OSU-T1-000001$/);
    const again = await ok("post", "/checkout", { token: S.cashier, body: sale });
    assert.equal(again.receiptNumber, r.receiptNumber);
    S.sale1 = r.saleId;
    const list = await ok("get", `/products?branchId=${S.branch}`, { token: S.cashier });
    assert.equal(list.find((p: any) => p.id === S.p1).stock, 9);
  });

  it("validates payments and stock", async () => {
    const base = { terminalId: S.tillId, lines: [{ productId: S.p2, quantity: 1 }] };
    await err("payment_short", "post", "/checkout", { token: S.cashier, body: { ...base, idempotencyKey: "k-2", payments: [{ method: "momo", amount: 10, phone: "0241234567" }] } });
    await err("overpaid_non_cash", "post", "/checkout", { token: S.cashier, body: { ...base, idempotencyKey: "k-3", payments: [{ method: "momo", amount: 50, phone: "0241234567" }] } });
    await err("insufficient_stock", "post", "/checkout", { token: S.cashier, body: { terminalId: S.tillId, idempotencyKey: "k-4", lines: [{ productId: S.p1, quantity: 99 }], payments: [{ method: "card", amount: 99 * 1999 }] } });
    // nothing was written by the failed sale
    const list = await ok("get", `/products?branchId=${S.branch}`, { token: S.cashier });
    assert.equal(list.find((p: any) => p.id === S.p1).stock, 9);
    // a MoMo number without a valid Ghana prefix is rejected before the sale is saved
    await err("invalid_momo_number", "post", "/checkout", { token: S.cashier, body: { ...base, idempotencyKey: "k-momo-bad", payments: [{ method: "momo", amount: 10, phone: "abc" }] } });
    // services aren't stock-tracked
    await ok("post", "/checkout", { token: S.cashier, body: { terminalId: S.tillId, idempotencyKey: "k-5", lines: [{ productId: S.p3, quantity: 1 }], payments: [{ method: "momo", amount: 250, reference: "MM123", phone: "0241234567" }] } });
    // every completed sale records its customer details: the MoMo number became a customer record
    const custs = await ok("get", "/customers", { token: S.cashier });
    const auto = custs.find((c: any) => c.phone === "0241234567");
    assert.ok(auto, "a MoMo sale should add the customer to customer data");
    assert.equal(auto.visits, 1);
    assert.equal(auto.totalSpend, 250);
  });

  it("needs a manager approval for discounts above the role limit and for price overrides", async () => {
    const body = { terminalId: S.tillId, idempotencyKey: "k-6", cartDiscount: 300, discountReason: "Loyal customer", lines: [{ productId: S.p1, quantity: 1 }], payments: [{ method: "cash", amount: 1699 }] };
    await err("approval_required", "post", "/checkout", { token: S.cashier, body });
    await err("approval_pin_wrong", "post", "/approvals", { token: S.cashier, body: { terminalId: S.tillId, approverId: S.managerId, pin: "0001", action: "discount", amount: 300 } });
    const approvers = await ok("get", `/approvers?branchId=${S.branch}`, { token: S.cashier });
    assert.ok(approvers.some((x: any) => x.id === S.managerId));
    const ap = await ok("post", "/approvals", { token: S.cashier, body: { terminalId: S.tillId, approverId: S.managerId, pin: "7391", action: "discount", amount: 300 } });
    const r = await ok("post", "/checkout", { token: S.cashier, body: { ...body, discountApprovalId: ap.approvalId } });
    assert.equal(r.total, 1699);
    S.sale2 = r.saleId;
    // approvals are single use
    await err("approval_required", "post", "/checkout", { token: S.cashier, body: { ...body, idempotencyKey: "k-7", discountApprovalId: ap.approvalId } });
    // small discount within the 5% cashier limit is fine
    await ok("post", "/checkout", { token: S.cashier, body: { terminalId: S.tillId, idempotencyKey: "k-8", cartDiscount: 1, lines: [{ productId: S.p2, quantity: 1 }], payments: [{ method: "cash", amount: 34 }] } });
    await err("approval_required", "post", "/checkout", { token: S.cashier, body: { terminalId: S.tillId, idempotencyKey: "k-9", lines: [{ productId: S.p2, quantity: 1, unitPrice: 20 }], payments: [{ method: "cash", amount: 20 }] } });
  });

  it("holds and resumes carts", async () => {
    const h = await ok("post", "/held-carts", { token: S.cashier, body: { branchId: S.branch, terminalId: S.tillId, lines: [{ productId: S.p2, quantity: 3 }], note: "Blue shirt" } });
    assert.equal((await ok("get", `/held-carts?branchId=${S.branch}`, { token: S.cashier })).length, 1);
    const r = await ok("post", `/held-carts/${h.id}/resume`, { token: S.cashier });
    assert.equal(r.lines[0].quantity, 3);
    await err("not_found", "post", `/held-carts/${h.id}/resume`, { token: S.cashier });
  });

  it("refunds (approval for cashier) and voids", async () => {
    const sale = await ok("get", `/sales/${S.sale1}`, { token: S.cashier });
    const glass = sale.items.find((i: any) => i.sku === "TG-U");
    const body = { items: [{ saleItemId: glass.id, quantity: 1 }], reason: "Cracked", restock: false, method: "cash", terminalId: S.tillId };
    await err("approval_required", "post", `/sales/${S.sale1}/refund`, { token: S.cashier, body });
    const ap = await ok("post", "/approvals", { token: S.cashier, body: { terminalId: S.tillId, approverId: S.managerId, pin: "7391", action: "refund", amount: 35 } });
    const r = await ok("post", `/sales/${S.sale1}/refund`, { token: S.cashier, body: { ...body, approvalId: ap.approvalId } });
    assert.equal(r.amount, 35);
    await err("refund_quantity_too_high", "post", `/sales/${S.sale1}/refund`, { token: S.manager, body: { ...body, items: [{ saleItemId: glass.id, quantity: 2 }] } });
    assert.equal((await ok("get", `/sales/${S.sale1}`, { token: S.manager })).status, "partially_refunded");
    await err("not_voidable", "post", `/sales/${S.sale1}/void`, { token: S.manager, body: { reason: "Mistake" } });
    await ok("post", `/sales/${S.sale2}/void`, { token: S.manager, body: { reason: "Rang up twice" } });
    const list = await ok("get", `/products?branchId=${S.branch}`, { token: S.cashier });
    assert.equal(list.find((p: any) => p.id === S.p1).stock, 9); // void returned the phone
    // cashier only sees their own sales; manager sees all
    assert.ok((await ok("get", `/sales?branchId=${S.branch}`, { token: S.cashier })).every((s: any) => s.cashierId === S.cashierId));
  });

  it("closes the shift: expected cash, variance needs a note and approval", async () => {
    const sum = await ok("get", `/shifts/${S.shift}/summary`, { token: S.cashier });
    // float 200 + cash(2100 + 34) − change 31 − refund 35 (sale2 voided → excluded)
    assert.equal(sum.shift.expectedCash, 2268);
    await ok("post", `/shifts/${S.shift}/cash-movements`, { token: S.cashier, body: { type: "paid_out", amount: 18, reason: "Water" } });
    await err("approval_required", "post", `/shifts/${S.shift}/cash-movements`, { token: S.cashier, body: { type: "no_sale", reason: "Change" } });
    const counts = { "200": 11, "20": 2, "5": 1 }; // 2245 vs expected 2250
    await err("approval_required", "post", `/shifts/${S.shift}/close`, { token: S.cashier, body: { counts: { "200": 10 }, note: "Short" } });
    await err("note_required", "post", `/shifts/${S.shift}/close`, { token: S.cashier, body: { counts: { "200": 10 } } });
    const r = await ok("post", `/shifts/${S.shift}/close`, { token: S.cashier, body: { counts } });
    assert.equal(r.expected, 2250);
    assert.equal(r.variance, -5);
    await err("shift_not_open", "post", `/shifts/${S.shift}/close`, { token: S.cashier, body: { counts } });
  });
});

describe("back office", () => {
  it("transfers stock between branches", async () => {
    const t = await ok("post", "/transfers", { token: S.manager, body: { fromBranchId: S.branch, toBranchId: S.branch2, items: [{ productId: S.p2, quantity: 10 }] } });
    assert.equal(t.number, "TR-0001");
    await ok("post", `/transfers/${t.id}/receive`, { token: S.manager });
    assert.equal((await ok("get", `/products?branchId=${S.branch2}`, { token: S.manager })).find((p: any) => p.id === S.p2).stock, 10);
    await err("transfer_not_open", "post", `/transfers/${t.id}/receive`, { token: S.manager });
  });

  it("runs purchase orders", async () => {
    const sup = await ok("post", "/suppliers", { token: S.owner, body: { name: "Accra Phone Hub", phone: "0244000000" } });
    const po = await ok("post", "/purchase-orders", { token: S.owner, body: { supplierId: sup.id, branchId: S.branch, place: true, lines: [{ productId: S.p1, quantity: 5, unitCost: 1450 }] } });
    const pos = await ok("get", "/purchase-orders", { token: S.owner });
    const item = pos[0].lines[0].id;
    await ok("post", `/purchase-orders/${po.id}/receive`, { token: S.owner, body: { lines: [{ itemId: item, quantity: 2 }], reference: "INV-9" } });
    assert.equal((await ok("get", "/purchase-orders", { token: S.owner }))[0].status, "partially_received");
    const sups = await ok("get", "/suppliers", { token: S.owner });
    assert.equal(sups[0].balance, 7250);
    assert.equal(sups[0].openOrders, 1);
  });

  it("records and voids expenses; dashboard and P&L add up", async () => {
    const e = await ok("post", "/expenses", { token: S.owner, body: { amount: 120, category: "Utilities", date: new Date().toISOString().slice(0, 10), method: "cash", branchId: S.branch, description: "ECG prepaid" } });
    await ok("post", "/expenses", { token: S.owner, body: { amount: 50, category: "Transport", date: new Date().toISOString().slice(0, 10), method: "momo", branchId: S.branch, description: "Delivery" } });
    await ok("post", `/expenses/${e.id}/void`, { token: S.owner, body: { reason: "Duplicate" } });
    const from = new Date(Date.now() - 3600_000).toISOString(), to = new Date(Date.now() + 60_000).toISOString();
    const d = await ok("get", `/reports/dashboard?branchId=${S.branch}&from=${from}&to=${to}`, { token: S.owner });
    // completed sales: 2069 (−35 refunded) + 250 + 34 ; voided 1699 excluded
    assert.equal(d.salesCount, 3);
    assert.equal(d.revenue, 2069 - 35 + 250 + 34);
    assert.equal(d.expenses, 50);
    assert.equal(d.changeGiven, 31);
    assert.equal(d.byMethod.find((m: any) => m.method === "cash").amount, 2134 - 31);
    const pnl = await ok("get", `/reports/pnl?from=${from}&to=${to}`, { token: S.owner });
    assert.equal(pnl.netRevenue, 2318);
    assert.equal(pnl.cogs, 1480 + 20 + 0 + 10); // cost at time of sale
    const emp = await ok("get", `/reports/employees?from=${from}&to=${to}`, { token: S.owner });
    const ama = emp.find((r: any) => r.memberId === S.cashierId);
    assert.equal(ama.salesCount, 3);
    assert.equal(ama.cashVariance, -5);
    assert.equal(emp.find((r: any) => r.memberId === S.managerId).approvalsGiven, 2);
    await err("permission_denied", "get", `/reports/pnl?from=${from}&to=${to}`, { token: S.cashier });
    const perf = await ok("get", `/reports/employees/${S.cashierId}?from=${from}&to=${to}`, { token: S.cashier });
    assert.equal(perf.salesCount, 3);
  });

  it("raises low-stock notifications and marks them read", async () => {
    await ok("post", "/stock/adjust", { token: S.owner, body: { branchId: S.branch, productId: S.p1, mode: "set", quantity: 2, reason: "Count" } });
    const ns = await ok("get", "/notifications", { token: S.owner });
    assert.ok(ns.some((x: any) => x.type === "low_stock" && !x.read));
    assert.equal((await ok("get", "/notifications", { token: S.cashier })).some((x: any) => x.type === "low_stock"), false);
    await ok("post", "/notifications/read", { token: S.owner });
    assert.ok((await ok("get", "/notifications", { token: S.owner })).every((x: any) => x.read));
  });

  it("hides notifications sent before a person joined and keeps them unread", async () => {
    const oldId = randomUUID();
    await db.run("INSERT INTO notifications (id, organization_id, member_id, audience_perm, type, title, body, read_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      [oldId, S.org, null, "pos.sell", "low_stock", "Older notice", "This notice was sent before the new account existed.", null, nowSql(new Date(Date.now() - 86_400_000))]);

    const added = await ok("post", "/employees", { token: S.owner, body: { fullName: "New Cashier", phone: "0245550199", roleId: S.roles.cashier.id, branchIds: [S.branch], inviteMethod: "temp_password" } });
    const token = (await ok("post", "/auth/login", { body: { identifier: "0245550199", password: added.tempPassword } })).token;

    assert.equal((await ok("get", "/notifications", { token })).some((x: any) => x.id === oldId), false);
    await ok("post", "/notifications/read", { token });
    const oldRow = (await db.all("SELECT read_by FROM notifications WHERE id = ?", [oldId]))[0]!;
    assert.equal(JSON.parse(oldRow.read_by ?? "[]").includes(added.memberId), false);

    const newId = randomUUID();
    await db.run("INSERT INTO notifications (id, organization_id, member_id, audience_perm, type, title, body, read_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      [newId, S.org, null, "pos.sell", "low_stock", "Newer notice", "This notice was sent after the new account existed.", null, nowSql(new Date(Date.now() + 60_000))]);
    assert.ok((await ok("get", "/notifications", { token })).some((x: any) => x.id === newId));
  });

  it("edits roles and per-employee access", async () => {
    const r = await ok("post", "/roles", { token: S.owner, body: { name: "Senior cashier", maxDiscountPercent: 15, permissions: ["pos.sell", "pos.discount", "shift.open_close", "bogus.perm"] } });
    const roles = await ok("get", "/roles", { token: S.owner });
    assert.deepEqual(roles.find((x: any) => x.id === r.id).permissions.sort(), ["pos.discount", "pos.sell", "shift.open_close"]);
    await ok("put", `/employees/${S.cashierId}/access`, { token: S.owner, body: { roleId: r.id, branchIds: [S.branch], overrides: [{ permission: "sales.view_all", effect: "grant" }] } });
    const me = await ok("get", "/me", { token: S.cashier });
    assert.ok(me.permissions.includes("sales.view_all"));
    await err("role_in_use", "delete", `/roles/${r.id}`, { token: S.owner });
    await err("system_role_locked", "delete", `/roles/${S.roles.cashier.id}`, { token: S.owner });
    await err("password_required", "put", `/employees/${S.cashierId}/access`, { token: (await ok("post", "/terminal/pin-login", { till: S.till, body: { memberId: S.managerId, pin: "7391" } })).token, body: {} });
    S.cashier = (await ok("post", "/terminal/pin-login", { till: S.till, body: { memberId: S.cashierId, pin: "4826" } })).token;
  });

  it("suspending signs the person out everywhere instantly", async () => {
    await err("reason_required", "post", `/employees/${S.cashierId}/status`, { token: S.owner, body: { status: "suspended" } });
    await ok("post", `/employees/${S.cashierId}/status`, { token: S.owner, body: { status: "suspended", reason: "Investigation" } });
    await err("unauthorized", "get", "/me", { token: S.cashier });
    await err("account_suspended", "post", "/auth/login", { body: { identifier: "0245550101", password: "cashier-pass-1" } });
    await err("not_allowed", "post", "/terminal/pin-login", { till: S.till, body: { memberId: S.cashierId, pin: "4826" } });
    await ok("post", `/employees/${S.cashierId}/status`, { token: S.owner, body: { status: "active" } });
    await ok("post", "/auth/login", { body: { identifier: "0245550101", password: "cashier-pass-1" } });
    await err("owner_cannot_be_changed", "post", `/employees/${S.ownerId}/status`, { token: S.manager, body: { status: "suspended", reason: "x" } });
  });

  it("revoking a till ends its sessions", async () => {
    const t = (await ok("post", "/terminal/pin-login", { till: S.till, body: { memberId: S.managerId, pin: "7391" } })).token;
    await ok("post", `/terminals/${S.tillId}/revoke`, { token: S.owner });
    await err("unauthorized", "get", "/me", { token: t });
    await err("unknown_terminal", "get", "/terminal/roster", { till: S.till });
  });

  it("keeps businesses apart", async () => {
    const s = await ok("post", "/auth/signup", { body: { email: "other@shop.com", password: "other-pass-1", fullName: "Other Owner" } });
    await ok("post", "/business", { token: s.token, body: { name: "Other Shop" } });
    assert.equal((await ok("get", "/employees", { token: s.token })).length, 1);
    await err("branch_not_allowed", "get", `/sales?branchId=${S.branch}`, { token: s.token });
    await err("not_found", "get", `/sales/${S.sale1}`, { token: s.token });
    await err("not_found", "post", `/employees/${S.cashierId}/status`, { token: s.token, body: { status: "suspended", reason: "x" } });
    await err("not_found", "patch", `/products/${S.p1}`, { token: s.token, body: { name: "Hacked" } });
  });

  it("password reset by email and ownership transfer", async () => {
    outbox.length = 0;
    await ok("post", "/auth/forgot", { body: { email: "nobody@nowhere.com" } });
    assert.equal(outbox.length, 0);
    await ok("post", "/auth/forgot", { body: { email: "owner@famoustechx.com" } });
    const token = decodeURIComponent(outbox[0]!.text.match(/token=([^&\s]+)/)![1]!);
    const s = await ok("post", "/auth/reset", { body: { token, password: "owner-pass-2" } });
    await err("unauthorized", "get", "/me", { token: S.owner }); // old sessions ended
    S.owner = s.token;
    await ok("post", `/employees/${S.managerId}/make-owner`, { token: S.owner });
    const me = await ok("get", "/me", { token: S.manager });
    assert.equal(me.member.isOwner, true);
    assert.equal((await ok("get", "/me", { token: S.owner })).member.isOwner, false);
  });

  it("owner can delete an employee without erasing their history", async () => {
    // After the ownership transfer, S.manager is the owner and S.owner is a plain member.
    await err("owner_only", "delete", `/employees/${S.cashierId}`, { token: S.owner, body: { reason: "Left" } });
    await err("cannot_delete_self", "delete", `/employees/${S.managerId}`, { token: S.manager, body: { reason: "x" } });
    await err("reason_required", "delete", `/employees/${S.cashierId}`, { token: S.manager, body: {} });

    const saleBefore = await ok("get", `/sales/${S.sale1}`, { token: S.manager });
    await ok("delete", `/employees/${S.cashierId}`, { token: S.manager, body: { reason: "Left the business" } });

    // Access ends immediately.
    await err("unauthorized", "get", "/me", { token: S.cashier });
    await err("unauthorized", "post", "/auth/login", { body: { identifier: "0245550101", password: "cashier-pass-1" } });
    await err("employee_deleted", "post", `/employees/${S.cashierId}/status`, { token: S.manager, body: { status: "active" } });
    await err("already_deleted", "delete", `/employees/${S.cashierId}`, { token: S.manager, body: { reason: "again" } });

    // List shows them as deleted; their sale and its recorded name survive untouched.
    const list = await ok("get", "/employees", { token: S.manager });
    assert.equal(list.find((e: { id: string }) => e.id === S.cashierId).status, "deleted");
    assert.deepEqual(await ok("get", `/sales/${S.sale1}`, { token: S.manager }), saleBefore);
    await ok("get", `/sales/${S.sale1}/receipt`, { token: S.manager });
  });
});
