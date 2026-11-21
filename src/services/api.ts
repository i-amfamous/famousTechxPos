/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  LOGIC SEAM — this is where the UI meets your business logic.
 * ─────────────────────────────────────────────────────────────────────────────
 *  Every screen reads data through the `use…` hooks below and triggers work
 *  through `actions.*`. Right now they return design-time sample data and
 *  resolve instantly so the UI can be reviewed.
 *
 *  To connect the real system: replace the body of each hook / action with your
 *  Supabase queries, RPCs or Edge Function calls. Keep the signatures and the
 *  screens will not need to change.
 *
 *  Design review helper: add `?demo=loading`, `?demo=empty` or `?demo=error`
 *  to any URL to see that screen's loading, empty and error states.
 */
import { useMemo } from "react";
import * as mock from "@/mock/data";
import type { CartLine, Employee, PaymentLine, Product, Role } from "@/types";

export interface QueryResult<T> {
  data: T;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

function demoState(): "loading" | "empty" | "error" | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("demo");
  return v === "loading" || v === "empty" || v === "error" ? v : null;
}

function useMock<T>(value: T, emptyValue: T): QueryResult<T> {
  const demo = demoState();
  return useMemo(
    () => ({
      data: demo === "empty" || demo === "loading" || demo === "error" ? emptyValue : value,
      loading: demo === "loading",
      error: demo === "error" ? "We couldn't load this data. Check your connection and try again." : null,
      refetch: () => {},
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [demo, value],
  );
}

/* ───────────── Queries (read) ───────────── */
// LOGIC: replace each with a Supabase query scoped by organization_id / branch and the viewer's permissions.
export const useBranches = () => useMock(mock.branches, []);
export const useEmployees = () => useMock(mock.employees, []);
export const useEmployee = (id: string) => useMock(mock.employees.find((e) => e.id === id) ?? null, null);
export const useRoles = () => useMock(mock.roles, []);
export const usePermissions = () => useMock(mock.permissions, []);
export const useTerminals = () => useMock(mock.terminals, []);
export const useProducts = () => useMock(mock.products, []);
export const useCategories = () => useMock(mock.categories, []);
export const useCustomers = () => useMock(mock.customers, []);
export const useSales = () => useMock(mock.sales, []);
export const useShifts = () => useMock(mock.shifts, []);
export const useCashMovements = () => useMock(mock.cashMovements, []);
export const useActivity = () => useMock(mock.activity, []);
export const useSignIns = () => useMock(mock.signIns, []);
export const useHeldCarts = () => useMock(mock.heldCarts, []);
export const useStockMovements = () => useMock(mock.stockMovements, []);
export const useSuppliers = () => useMock(mock.suppliers, []);
export const usePurchaseOrders = () => useMock(mock.purchaseOrders, []);
export const useExpenses = () => useMock(mock.expenses, []);
export const useNotifications = () => useMock(mock.notifications, []);
export const useSalesTrend = () => useMock(mock.salesTrend, []);

/* ───────────── Actions (write) ───────────── */
// Each action returns a Promise so the UI can show pending / success / error.
// LOGIC: implement these against trusted server functions (see SRS §7).
const ok = <T = void>(value?: T) => new Promise<T>((r) => setTimeout(() => r(value as T), 350));

export const actions = {
  // Auth & session
  signIn: (_email: string, _password: string) => ok(),
  requestPasswordReset: (_email: string) => ok(),
  acceptInvite: (_token: string, _password: string) => ok(),
  /** Verify an employee PIN on a registered terminal. Resolve `false` on wrong PIN. */
  verifyPin: (_employeeId: string, pin: string) => ok(pin !== "0000"),
  /** Manager approval for a restricted action. Resolve `false` if PIN wrong or no permission. */
  approveAction: (_approverId: string, pin: string, _action: { type: string; amount?: number; reason?: string }) => ok(pin !== "0000"),
  lockTerminal: () => ok(),

  // Shifts & cash
  openShift: (_openingFloat: number) => ok(),
  recordCashMovement: (_input: { type: "paid_in" | "paid_out" | "drop" | "no_sale"; amount: number; reason: string }) => ok(),
  closeShift: (_input: { counted: Record<string, number>; total: number; note?: string; approverId?: string }) => ok(),

  // POS
  checkout: (_input: { lines: CartLine[]; payments: PaymentLine[]; customerId?: string; idempotencyKey: string }) =>
    ok({ receiptNumber: "OSU-T1-000483" }),
  holdCart: (_lines: CartLine[], _note: string) => ok(),
  refundSale: (_saleId: string, _input: { items: { sku: string; quantity: number }[]; reason: string; restock: boolean }) => ok(),
  voidSale: (_saleId: string, _reason: string) => ok(),

  // Employees & roles
  createEmployee: (_input: Partial<Employee> & { inviteMethod: "email" | "temp_password" }) => ok(),
  updateEmployee: (_id: string, _patch: Partial<Employee>) => ok(),
  setEmployeeStatus: (_id: string, _status: Employee["status"], _reason?: string) => ok(),
  resetPin: (_id: string) => ok(),
  resetPassword: (_id: string) => ok(),
  forceSignOut: (_id: string) => ok(),
  saveRole: (_role: Partial<Role>) => ok(),
  revokeTerminal: (_id: string) => ok(),
  registerTerminal: (_name: string, _branchId: string) => ok({ code: "FTX-7Q4M" }),

  // Catalogue / stock / other
  saveProduct: (_p: Partial<Product>) => ok(),
  adjustStock: (_productId: string, _delta: number, _reason: string) => ok(),
  saveCustomer: (_c: unknown) => ok(),
  saveExpense: (_e: unknown) => ok(),
  saveSupplier: (_s: unknown) => ok(),
  savePurchaseOrder: (_po: unknown) => ok(),
  receivePurchaseOrder: (_id: string, _lines: unknown) => ok(),
  saveBranch: (_b: unknown) => ok(),
  saveSettings: (_s: unknown) => ok(),
  markNotificationsRead: (_ids: string[]) => ok(),
};
