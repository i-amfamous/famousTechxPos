/**
 * Write operations. Every action calls one API endpoint, then invalidates the cached queries it affects.
 * The server works out the business and the person from the session, and enforces every permission.
 */
import * as mock from "@/mock/data";
import { AppError } from "@/lib/errors";
import { DEMO, SIGNED_OUT_EVENT, credentials, http } from "@/lib/http";
import { invalidate, invalidateAll, refreshSession, resetQueries } from "@/lib/query";
import type { BarcodeLookup, CartLine, Category, Customer, Employee, PaymentLine, PaymentMethod, Product, Role, SaleReceipt } from "@/types";
import { pause } from "./demo";

interface SessionGrant { token: string }
/** Stores a new session and drops every cached query, so nothing from the previous person lingers. */
const startSession = ({ token }: SessionGrant) => {
  credentials.setSession(token);
  resetQueries();
  invalidateAll();
};

export interface CheckoutInput {
  terminalId: string; lines: CartLine[]; payments: PaymentLine[]; customerId?: string;
  /** Customer details captured at the till; the server saves them even without an attached customer. */
  customer?: { name?: string; phone?: string; email?: string };
  cartDiscount: number;
  discountReason?: string; discountApprovalId?: string | null; priceApprovalId?: string | null; idempotencyKey: string;
}

export interface NewEmployeeInput {
  fullName: string; displayName?: string; phone: string; email?: string; roleId: string; branchIds: string[];
  inviteMethod: "email" | "temp_password"; hireDate?: string; employeeCode?: string;
}

/** Result of creating an employee or resetting their access. Exactly one of these tells the manager what to hand over. */
export interface AccessHandover { tempPassword?: string; emailed?: string; inviteLink?: string }

export type EmployeeAdminAction = "resend_invite" | "reset_password" | "set_status" | "sign_out";

export interface ProductDraft {
  name: string; sku: string; barcode?: string; brand?: string; description?: string; imageUrl?: string; categoryId?: string;
  costPrice: number; sellingPrice: number; unit: string; taxable: boolean; reorderLevel: number; openingStock: number;
  variants?: { label: string; sku: string; barcode?: string; openingStock: number }[];
}

export const actions = {
  /* ───────── Accounts ───────── */
  async signIn(identifier: string, password: string) {
    if (DEMO) return pause();
    startSession(await http.post<SessionGrant>("/auth/login", { identifier, password }));
  },

  async signUp(email: string, password: string, fullName: string) {
    if (DEMO) return pause();
    startSession(await http.post<SessionGrant>("/auth/signup", { email, password, fullName }));
  },

  async requestPasswordReset(email: string) {
    if (DEMO) return pause();
    await http.post("/auth/forgot", { email });
  },

  /** Sets a password from an invite/reset link (`linkToken`), or replaces a temporary password after sign-in. */
  async setPassword(password: string, linkToken?: string | null) {
    if (DEMO) return pause();
    if (linkToken) startSession(await http.post<SessionGrant>("/auth/reset", { token: linkToken, password }));
    else await http.post("/me/password", { next: password });
  },

  async changePassword(current: string, next: string) {
    if (DEMO) return pause();
    await http.post("/me/password", { current, next });
    refreshSession();
  },

  async updateMyProfile(fullName: string, phone: string) {
    if (DEMO) return pause();
    await http.patch("/me/profile", { fullName, phone });
    refreshSession();
    invalidate("employees", "activity");
  },

  async createBusiness(details: Record<string, unknown>) {
    if (DEMO) return pause("demo");
    const { organizationId } = await http.post<{ organizationId: string }>("/business", details);
    refreshSession();
    invalidateAll();
    return organizationId;
  },

  /* ───────── Tills & PINs ───────── */
  async pinLogin(memberId: string, pin: string): Promise<{ ok: true } | { ok: false; error: string; attemptsLeft?: number }> {
    if (DEMO) { await pause(); return pin === "0000" ? { ok: false, error: "Wrong PIN.", attemptsLeft: 4 } : { ok: true }; }
    try {
      startSession(await http.post<SessionGrant>("/terminal/pin-login", { memberId, pin }));
      return { ok: true };
    } catch (e) {
      const err = e as AppError;
      if (err.code === "network") throw err;
      return { ok: false, error: err.message, attemptsLeft: err.details.attemptsLeft as number | undefined };
    }
  },

  /** First use of a till: the employee proves who they are with their password and chooses a PIN. */
  async pinSetup(memberId: string, password: string, pin: string) {
    if (DEMO) return pause();
    startSession(await http.post<SessionGrant>("/terminal/pin-setup", { memberId, password, pin }));
  },

  /** Ends the PIN session on this till (the till itself stays registered). */
  async lockTerminal() {
    if (DEMO) return pause();
    const token = credentials.session();
    await http.post("/terminal/lock").catch(() => null); // lock locally even when offline
    // A PIN switch during that request already installed a new token; never sign them out.
    if (credentials.session() === token) {
      credentials.setSession(null);
      window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
    }
  },

  async registerTerminal(name: string, branchId: string) {
    if (DEMO) return pause({ terminalId: "t9", token: "demo" });
    const r = await http.post<{ terminalId: string; token: string }>("/terminals", { name, branchId });
    invalidate("terminals");
    return r;
  },

  async revokeTerminal(id: string) {
    if (DEMO) return pause();
    await http.post(`/terminals/${id}/revoke`);
    invalidate("terminals");
  },

  async setMyPin(pin: string) {
    if (DEMO) return pause();
    await http.post("/me/pin", { pin });
  },

  async resetPin(memberId: string) {
    if (DEMO) return pause();
    await http.post(`/employees/${memberId}/reset-pin`);
    invalidate("employees", "activity");
  },

  /** A manager enters their PIN on this device; returns a single-use approval id. */
  async approveAction(i: { terminalId: string | null; approverId: string; pin: string; action: string; amount?: number; detail?: string }) {
    if (DEMO) { await pause(); if (i.pin === "0000") throw new AppError("Wrong PIN."); return "demo-approval"; }
    const { approvalId } = await http.post<{ approvalId: string }>("/approvals", i);
    return approvalId;
  },

  /* ───────── Shifts ───────── */
  async openShift(terminalId: string, openingFloat: number) {
    if (DEMO) return pause("sh1");
    const { shiftId } = await http.post<{ shiftId: string }>("/shifts", { terminalId, openingFloat });
    invalidate("shifts", "dashboard");
    return shiftId;
  },

  async recordCashMovement(shiftId: string, type: "paid_in" | "paid_out" | "drop" | "no_sale", amount: number, reason: string, approvalId?: string | null) {
    if (DEMO) return pause();
    await http.post(`/shifts/${shiftId}/cash-movements`, { type, amount, reason, approvalId });
    invalidate("shifts", "cash_movements", "activity");
  },

  async closeShift(shiftId: string, counts: Record<string, number>, note: string, approvalId?: string | null) {
    if (DEMO) return pause();
    await http.post(`/shifts/${shiftId}/close`, { counts, note, approvalId });
    invalidate("shifts", "dashboard", "activity");
  },

  /* ───────── Selling ───────── */
  /** Reserves a Paystack reference for the Inline dialog. Only the public key comes back. */
  async initializePaystack(i: { amount: number; email?: string; phone?: string; channel?: "momo" | "card" }): Promise<{ reference: string; publicKey: string; email: string; amount: number }> {
    if (DEMO) return { reference: `DEMO-${Date.now()}`, publicKey: "pk_demo", email: i.email || "customer@example.com", amount: i.amount };
    return http.post("/paystack/initialize", i);
  },

  async checkout(i: CheckoutInput): Promise<SaleReceipt> {
    if (DEMO) return demoReceipt(i);
    const receipt = await http.post<SaleReceipt>("/checkout", {
      terminalId: i.terminalId, customerId: i.customerId ?? null, customer: i.customer ?? null, idempotencyKey: i.idempotencyKey,
      cartDiscount: i.cartDiscount, discountReason: i.discountReason ?? null,
      discountApprovalId: i.discountApprovalId ?? null, priceApprovalId: i.priceApprovalId ?? null,
      // The price is only sent when the cashier changed it, so the server always prices from the catalogue otherwise.
      lines: i.lines.map((l) => ({ productId: l.productId, variantId: l.variantId ?? null, quantity: l.quantity, discount: l.discount, ...(l.priceOverride ? { unitPrice: l.unitPrice } : {}) })),
      // Phone and network power the network-specific MoMo request - don't drop them on the wire.
      payments: i.payments.map((p) => ({ method: p.method, amount: p.amount, reference: p.reference ?? null, phone: p.phone ?? null, network: p.network ?? null, paystackReference: p.paystackReference ?? null })),
    });
    invalidate("sales", "products", "shifts", "dashboard", "customers", "activity", "movements", "notifications");
    return receipt;
  },

  async saleReceipt(saleId: string): Promise<SaleReceipt | null> {
    if (DEMO) return null;
    return http.get<SaleReceipt>(`/sales/${saleId}/receipt`);
  },

  /** Public, read-only copy shown when a customer scans the code on a printed receipt. */
  async digitalReceipt(token: string): Promise<SaleReceipt> {
    return http.get<SaleReceipt>(`/receipts/${encodeURIComponent(token)}`);
  },

  async holdCart(i: { branchId: string; terminalId: string | null; lines: CartLine[]; note: string }) {
    if (DEMO) return pause();
    await http.post("/held-carts", i);
    invalidate("held");
  },

  async resumeHeldCart(id: string, approvalId?: string | null): Promise<CartLine[]> {
    if (DEMO) return pause(mock.heldCarts.find((h) => h.id === id)?.lines ?? []);
    const { lines } = await http.post<{ lines: CartLine[] }>(`/held-carts/${id}/resume`, { approvalId });
    invalidate("held");
    return lines;
  },

  async discardHeldCart(id: string) {
    if (DEMO) return pause();
    await http.delete(`/held-carts/${id}`);
    invalidate("held");
  },

  async refundSale(saleId: string, i: { items: { saleItemId: string; quantity: number }[]; reason: string; restock: boolean; method: PaymentMethod; approvalId?: string | null; terminalId?: string | null }) {
    if (DEMO) return pause();
    await http.post(`/sales/${saleId}/refund`, i);
    invalidate("sales", "sale", "products", "dashboard", "activity", "shifts");
  },

  async voidSale(saleId: string, reason: string, approvalId?: string | null) {
    if (DEMO) return pause();
    await http.post(`/sales/${saleId}/void`, { reason, approvalId });
    invalidate("sales", "sale", "products", "dashboard", "activity");
  },

  /* ───────── Customers ───────── */
  async saveCustomer(c: { id?: string; name: string; phone: string; email?: string; address?: string; notes?: string }): Promise<Customer> {
    if (DEMO) return pause({ id: "cu-new", name: c.name, phone: c.phone, email: c.email, totalSpend: 0, visits: 0 });
    const saved = c.id ? await http.patch<Customer>(`/customers/${c.id}`, c) : await http.post<Customer>("/customers", c);
    invalidate("customers");
    return saved;
  },

  async archiveCustomer(id: string) {
    if (DEMO) return pause();
    await http.post(`/customers/${id}/archive`);
    invalidate("customers");
  },

  /* ───────── Employees & roles ───────── */
  async createEmployee(input: NewEmployeeInput): Promise<{ memberId: string } & AccessHandover> {
    if (DEMO) return pause({ memberId: "e10", tempPassword: input.inviteMethod === "temp_password" ? "Ftx-48Kq-2m7" : undefined, emailed: input.email });
    const r = await http.post<{ memberId: string } & AccessHandover>("/employees", input);
    invalidate("employees", "roles");
    return r;
  },

  async employeeAdmin(action: EmployeeAdminAction, memberId: string, extra: { status?: string; reason?: string } = {}): Promise<AccessHandover> {
    if (DEMO) return pause(action === "reset_password" ? { tempPassword: "Ftx-7Hn2-Qp4" } : {});
    const path = { resend_invite: "resend-invite", reset_password: "reset-password", set_status: "status", sign_out: "sign-out" }[action];
    const r = await http.post<AccessHandover>(`/employees/${memberId}/${path}`, extra);
    invalidate("employees", "activity", "signins");
    refreshSession();
    return r;
  },

  /**
   * Owner-only soft delete. The account loses all access, but every sale, shift and record that
   * mentions this employee stays intact and still shows their name.
   */
  async deleteEmployee(memberId: string, reason: string) {
    if (DEMO) return pause();
    await http.delete(`/employees/${memberId}`, { reason });
    invalidate("employees", "activity", "signins", "sales", "shifts", "dashboard", "roles", "reports");
    refreshSession();
  },

  async updateEmployeeProfile(memberId: string, patch: { fullName?: string; displayName?: string; phone?: string; email?: string; employeeCode?: string; hireDate?: string }) {
    if (DEMO) return pause();
    await http.patch(`/employees/${memberId}`, patch);
    invalidate("employees", "activity");
  },

  async saveMemberAccess(memberId: string, roleId: string, overrides: Employee["overrides"], branchIds: string[]) {
    if (DEMO) return pause();
    await http.put(`/employees/${memberId}/access`, { roleId, overrides, branchIds });
    invalidate("employees", "roles", "activity");
    refreshSession();
  },

  async transferOwnership(memberId: string) {
    if (DEMO) return pause();
    await http.post(`/employees/${memberId}/make-owner`);
    invalidate("employees", "roles");
  },

  async saveRole(role: Partial<Role>) {
    if (DEMO) return pause(role.id ?? "new");
    const body = { name: role.name, description: role.description, maxDiscountPercent: role.limits?.maxDiscountPercent, maxRefundAmount: role.limits?.maxRefundAmount, allowNoSale: role.limits?.allowNoSale, permissions: role.permissions };
    const isNew = !role.id || role.id === "new";
    const { id } = isNew ? await http.post<{ id: string }>("/roles", body) : await http.put<{ id: string }>(`/roles/${role.id}`, body);
    invalidate("roles", "activity");
    refreshSession();
    return id;
  },

  async deleteRole(id: string) {
    if (DEMO) return pause();
    await http.delete(`/roles/${id}`);
    invalidate("roles");
    refreshSession();
  },

  /* ───────── Catalogue & stock ───────── */
  async createProduct(branchId: string, p: ProductDraft) {
    if (DEMO) return pause("p-new");
    const { id } = await http.post<{ id: string }>("/products", { ...p, branchId, variants: (p.variants ?? []).filter((v) => v.label) });
    invalidate("products", "movements", "activity");
    return id;
  },

  async updateProduct(id: string, patch: Partial<Omit<ProductDraft, "openingStock" | "variants"> & { status: "active" | "archived" }>) {
    if (DEMO) return pause();
    await http.patch(`/products/${id}`, patch);
    invalidate("products");
  },

  async createCategory(name: string) {
    if (DEMO) return pause({ id: "c-new", name, color: "bg-brand-100 text-brand-800" } as Category);
    const category = await http.post<Category>("/categories", { name });
    invalidate("categories");
    return category;
  },

  /** Your catalogue first; otherwise an online lookup (UPCitemdb / Open Food Facts) through the server. */
  async lookupBarcode(code: string, catalogue: Product[]): Promise<BarcodeLookup> {
    const value = code.trim();
    const hit = catalogue.find((p) => p.barcode === value || p.sku.toLowerCase() === value.toLowerCase() || p.variants?.some((v) => v.barcode === value || v.sku === value));
    if (hit) return { found: true, source: "catalogue", product: hit };
    if (DEMO) return demoBarcode(value);
    try {
      const r = await http.get<{ found: boolean; product: BarcodeLookup["online"] | null }>(`/barcode/${encodeURIComponent(value)}`);
      return r.found && r.product ? { found: true, source: "online", online: r.product } : { found: false, source: "none" };
    } catch {
      return { found: false, source: "none" };
    }
  },

  async adjustStock(branchId: string, productId: string, mode: "add" | "remove" | "set", quantity: number, reason: string) {
    if (DEMO) return pause(0);
    const { quantity: after } = await http.post<{ quantity: number }>("/stock/adjust", { branchId, productId, mode, quantity, reason });
    invalidate("products", "movements", "activity", "dashboard");
    return after;
  },

  async receiveStock(branchId: string, productId: string, quantity: number, unitCost?: number | null, reference?: string) {
    if (DEMO) return pause(0);
    const { quantity: after } = await http.post<{ quantity: number }>("/stock/receive", { branchId, productId, quantity, unitCost: unitCost ?? null, reference: reference || null });
    invalidate("products", "movements", "activity", "dashboard");
    return after;
  },

  async createTransfer(fromBranchId: string, toBranchId: string, items: { productId: string; quantity: number }[], note?: string) {
    if (DEMO) return pause();
    await http.post("/transfers", { fromBranchId, toBranchId, items, note: note || null });
    invalidate("transfers", "products", "movements");
  },

  async receiveTransfer(id: string) {
    if (DEMO) return pause();
    await http.post(`/transfers/${id}/receive`);
    invalidate("transfers", "products", "movements");
  },

  /* ───────── Purchasing ───────── */
  async saveSupplier(s: { id?: string; name: string; phone?: string; email?: string; address?: string; notes?: string }) {
    if (DEMO) return pause();
    if (s.id) await http.patch(`/suppliers/${s.id}`, s);
    else await http.post("/suppliers", s);
    invalidate("suppliers");
  },

  async savePurchaseOrder(p: { supplierId: string; branchId: string; expectedAt?: string; place: boolean; lines: { productId: string; quantity: number; unitCost: number }[] }) {
    if (DEMO) return pause("po-new");
    const { id } = await http.post<{ id: string }>("/purchase-orders", { ...p, expectedAt: p.expectedAt || null });
    invalidate("purchases", "suppliers");
    return id;
  },

  async setPurchaseOrderStatus(id: string, status: "ordered" | "cancelled") {
    if (DEMO) return pause();
    await http.post(`/purchase-orders/${id}/status`, { status });
    invalidate("purchases", "suppliers");
  },

  async receivePurchaseOrder(id: string, lines: { itemId: string; quantity: number }[], reference?: string) {
    if (DEMO) return pause();
    await http.post(`/purchase-orders/${id}/receive`, { lines, reference: reference || null });
    invalidate("purchases", "suppliers", "products", "movements");
  },

  /* ───────── Money & business ───────── */
  async saveExpense(e: { amount: number; category: string; date: string; method: PaymentMethod; branchId: string; description: string }) {
    if (DEMO) return pause();
    await http.post("/expenses", e);
    invalidate("expenses", "dashboard", "reports");
  },

  async voidExpense(id: string, reason: string) {
    if (DEMO) return pause();
    await http.post(`/expenses/${id}/void`, { reason });
    invalidate("expenses", "dashboard", "reports");
  },

  async saveBranch(b: { id?: string; name: string; code?: string; address?: string; phone?: string; status: "active" | "inactive" }) {
    if (DEMO) return pause();
    if (b.id) await http.patch(`/branches/${b.id}`, b);
    else await http.post("/branches", b);
    invalidate("branches");
    refreshSession();
  },

  async saveSettings(patch: Record<string, unknown>) {
    if (DEMO) return pause();
    await http.patch("/settings", patch);
    refreshSession();
    invalidate("dashboard", "reports");
  },

  async markNotificationsRead(ids?: string[]) {
    if (DEMO) return pause();
    await http.post("/notifications/read", { ids: ids ?? null });
    invalidate("notifications");
  },
};

/* ───────── Demo stand-ins ───────── */
async function demoReceipt(i: CheckoutInput): Promise<SaleReceipt> {
  await pause();
  const subtotal = i.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const discount = i.lines.reduce((s, l) => s + l.discount, 0) + i.cartDiscount;
  const total = subtotal - discount;
  const paid = i.payments.reduce((s, p) => s + p.amount, 0);
  return {
    receiptNumber: "OSU-T1-000483", createdAt: new Date().toISOString(), servedBy: "", terminal: "Till 1", branch: "Accra – Osu (Main)",
    items: i.lines.map((l) => ({ name: l.name, quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount })),
    subtotal, discountTotal: discount, taxTotal: 0, total, payments: i.payments, change: Math.max(0, paid - total),
  };
}

async function demoBarcode(code: string): Promise<BarcodeLookup> {
  await pause();
  if (code.startsWith("0") || code.length < 8) return { found: false, source: "none" };
  return { found: true, source: "online", online: { name: "Anker PowerCore 10000 Portable Charger", brand: "Anker", description: "10000mAh power bank with PowerIQ fast charging.", category: "Power", images: [], source: "UPCitemdb (demo)" } };
}
