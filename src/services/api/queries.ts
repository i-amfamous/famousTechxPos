/**
 * Read hooks. Each returns `{ data, loading, error, refetch }` and is cached by key; actions invalidate
 * keys by prefix after a write. The server returns data in the shapes from `@/types`.
 */
import * as mock from "@/mock/data";
import { useSession } from "@/app/session";
import { DEMO, http } from "@/lib/http";
import type { QueryState } from "@/lib/query";
import type {
  ActivityEvent, AppNotification, CashMovement, Category, Customer, DashboardSummary, Employee, EmployeeReportRow, Expense,
  HeldCart, PaymentMethod, Permission, PnlReport, Product, PurchaseOrder, Role, Sale, Shift, ShiftSummary, SignInEvent,
  StockMovement, Supplier, Terminal, Transfer,
} from "@/types";
import { useData, useDemo } from "./demo";

export type { QueryState };
export type ReportRange = "today" | "7d" | "30d";

/** [from, to) for a report range, in the device's local days. */
export function rangeFor(range: ReportRange): [Date, Date] {
  const to = new Date();
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  if (range === "7d") from.setDate(from.getDate() - 6);
  if (range === "30d") from.setDate(from.getDate() - 29);
  to.setMinutes(to.getMinutes() + 1);
  return [from, to];
}
const rangeQuery = (range: ReportRange) => {
  const [from, to] = rangeFor(range);
  return { from: from.toISOString(), to: to.toISOString() };
};
const dayLabel = (day: string, style: "date" | "weekday") =>
  new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", style === "date" ? { day: "2-digit", month: "short" } : { weekday: "short" });

/* ═════════════ Business structure ═════════════ */
export function useBranches() {
  const s = useSession();
  // The session already loads branches; expose them like any other query.
  return useDemo(DEMO ? mock.branches : s.branches, []);
}

export function useRoles() {
  const s = useSession();
  return useDemo(DEMO ? mock.roles : s.roles, [] as Role[]);
}

export function usePermissions() {
  return useData(["permissions"], () => http.get<Permission[]>("/permissions"), mock.permissions, [] as Permission[]);
}

export function useTerminals() {
  const { orgId } = useSession();
  return useData(["terminals", orgId], () => http.get<Terminal[]>("/terminals"), mock.terminals, [] as Terminal[]);
}

/* ═════════════ People ═════════════ */
export function useEmployees() {
  const { orgId } = useSession();
  return useData(["employees", orgId], () => http.get<Employee[]>("/employees"), mock.employees, [] as Employee[], !!orgId || DEMO);
}

export function useEmployee(id: string) {
  const all = useEmployees();
  return { ...all, data: all.data.find((e) => e.id === id) ?? null };
}

export function useApprovers(permission = "pos.approve") {
  const { orgId, branch, posUser, roleOf } = useSession();
  const demo = mock.employees
    .filter((e) => e.status === "active" && e.id !== posUser?.id && e.branchIds.includes(branch.id) && roleOf(e).permissions.includes(permission))
    .map((e) => ({ id: e.id, fullName: e.fullName, displayName: e.displayName, avatarColor: e.avatarColor, roleName: roleOf(e).name }));
  return useData(["approvers", orgId, branch.id, permission], () => http.get<typeof demo>("/approvers", { branchId: branch.id, perm: permission }), demo, [], !!branch.id);
}

export function useActivity() {
  const { orgId } = useSession();
  return useData(["activity", orgId], () => http.get<ActivityEvent[]>("/activity"), mock.activity, [] as ActivityEvent[]);
}

export function useSignIns() {
  const { orgId } = useSession();
  return useData(["signins", orgId], () => http.get<SignInEvent[]>("/sign-ins"), mock.signIns, [] as SignInEvent[]);
}

/* ═════════════ Catalogue & stock ═════════════ */
export function useCategories() {
  const { orgId } = useSession();
  return useData(["categories", orgId], () => http.get<Category[]>("/categories"), mock.categories, [] as Category[]);
}

/** Products with stock at the current branch. */
export function useProducts() {
  const { orgId, branch } = useSession();
  return useData(["products", orgId, branch.id], () => http.get<Product[]>("/products", { branchId: branch.id }), mock.products, [] as Product[], !!branch.id);
}

export function useStockMovements() {
  const { orgId, branch } = useSession();
  return useData(["movements", orgId, branch.id], () => http.get<StockMovement[]>("/stock/movements", { branchId: branch.id }), mock.stockMovements, [] as StockMovement[], !!branch.id);
}

const demoTransfers: Transfer[] = [
  { id: "tr8", number: "TR-0008", fromBranchId: "br1", toBranchId: "br2", status: "dispatched", createdAt: new Date().toISOString(), items: [{ productId: "p6", quantity: 3 }] },
  { id: "tr7", number: "TR-0007", fromBranchId: "br1", toBranchId: "br2", status: "received", createdAt: new Date(Date.now() - 864e5).toISOString(), items: [{ productId: "p6", quantity: 5 }] },
];
export function useTransfers() {
  const { orgId } = useSession();
  return useData(["transfers", orgId], () => http.get<Transfer[]>("/transfers"), demoTransfers, [] as Transfer[]);
}

/* ═════════════ Selling ═════════════ */
export function useCustomers() {
  const { orgId } = useSession();
  return useData(["customers", orgId], () => http.get<Customer[]>("/customers"), mock.customers, [] as Customer[]);
}

export function useSales() {
  const { orgId, branch } = useSession();
  return useData(["sales", orgId, branch.id], () => http.get<Sale[]>("/sales", { branchId: branch.id }), mock.sales, [] as Sale[], !!branch.id);
}

export function useSale(id: string) {
  const all = useSales();
  const live = useData(["sale", id], () => http.get<Sale>(`/sales/${id}`), null as Sale | null, null as Sale | null, !!id);
  return DEMO ? { ...all, data: all.data.find((s) => s.id === id) ?? null } : live;
}

export interface RefundRecord { id: string; amount: number; reason: string; method: PaymentMethod; status: string; restocked: boolean; actorName: string; createdAt: string }
export function useSaleRefunds(id: string) {
  return useData(["sale", id, "refunds"], () => http.get<RefundRecord[]>(`/sales/${id}/refunds`), [] as RefundRecord[], []);
}

export function useHeldCarts() {
  const { orgId, branch } = useSession();
  return useData(["held", orgId, branch.id], () => http.get<HeldCart[]>("/held-carts", { branchId: branch.id }), mock.heldCarts, [] as HeldCart[], !!branch.id && !!orgId);
}

/* ═════════════ Shifts & cash ═════════════ */
export function useShifts() {
  const { orgId, branch } = useSession();
  return useData(["shifts", orgId, branch.id], () => http.get<Shift[]>("/shifts", { branchId: branch.id }), mock.shifts, [] as Shift[], !!branch.id);
}

export function useShiftSummary(shiftId: string | null) {
  const demo: ShiftSummary = { shift: mock.shifts[0]!, movements: mock.cashMovements.filter((m) => m.shiftId === "sh1"), refundsCash: 0 };
  return useData(["shifts", "summary", shiftId], () => http.get<ShiftSummary>(`/shifts/${shiftId}/summary`), demo as ShiftSummary | null, null, !!shiftId);
}

export function useCashMovements() {
  const { orgId } = useSession();
  return useData(["cash_movements", orgId], () => http.get<CashMovement[]>("/cash-movements"), mock.cashMovements, [] as CashMovement[]);
}

/* ═════════════ Purchasing, expenses, notifications ═════════════ */
export function useSuppliers() {
  const { orgId } = useSession();
  return useData(["suppliers", orgId], () => http.get<Supplier[]>("/suppliers"), mock.suppliers, [] as Supplier[]);
}

export function usePurchaseOrders() {
  const { orgId } = useSession();
  return useData(["purchases", orgId], () => http.get<PurchaseOrder[]>("/purchase-orders"), mock.purchaseOrders, [] as PurchaseOrder[]);
}

export function useExpenses() {
  const { orgId } = useSession();
  return useData(["expenses", orgId], () => http.get<Expense[]>("/expenses"), mock.expenses, [] as Expense[]);
}

export function useNotifications() {
  const { orgId } = useSession();
  return useData(["notifications", orgId], () => http.get<AppNotification[]>("/notifications"), mock.notifications, [] as AppNotification[], !!orgId || DEMO);
}

/* ═════════════ Reports ═════════════ */
const demoDashboard: DashboardSummary = {
  revenue: 8560, prevRevenue: 12060, salesCount: 27, prevSalesCount: 31, grossProfit: 1942.5, expenses: 600, expenseCount: 1, changeGiven: 0,
  byMethod: [{ method: "momo", amount: 28920 }, { method: "cash", amount: 14310 }, { method: "card", amount: 7330 }, { method: "bank", amount: 2274 }],
  topProducts: ([["Samsung Galaxy A15", 11994, 6], ["HP 250 G9 Laptop", 6199, 1], ["Oraimo FreePods 4", 3141, 9], ["Power Bank 20,000mAh", 2750, 11], ["Tempered Glass (Universal)", 1365, 39]] as const)
    .map(([name, revenue, quantity], i) => ({ productId: String(i), name, revenue, quantity })),
  trend: mock.salesTrend,
  onShift: mock.shifts.filter((s) => s.status === "open").map((s) => {
    const e = mock.employees.find((x) => x.id === s.employeeId)!;
    return { shiftId: s.id, memberId: e.id, fullName: e.fullName, avatarColor: e.avatarColor, terminal: mock.terminals.find((t) => t.id === s.terminalId)!.name, openedAt: s.openedAt, salesTotal: s.salesTotal, salesCount: s.salesCount };
  }),
  lowStock: mock.products.filter((p) => p.unit !== "job" && p.status === "active" && p.stock <= p.reorderLevel).map((p) => ({ id: p.id, name: p.name, quantity: p.stock, reorderLevel: p.reorderLevel })),
};
const emptyDashboard: DashboardSummary = { ...demoDashboard, revenue: 0, prevRevenue: 0, salesCount: 0, prevSalesCount: 0, grossProfit: 0, expenses: 0, expenseCount: 0, byMethod: [], topProducts: [], trend: [], onShift: [], lowStock: [] };

type ApiDashboard = Omit<DashboardSummary, "trend"> & { trend: { day: string; value: number }[] };

export function useDashboard(range: ReportRange, allBranches = false) {
  const { orgId, branch } = useSession();
  const branchId = allBranches ? null : branch.id;
  return useData(["dashboard", orgId, branchId ?? "all", range], async () => {
    const r = await http.get<ApiDashboard>("/reports/dashboard", { branchId, ...rangeQuery(range) });
    return { ...r, trend: r.trend.map((t) => ({ label: dayLabel(t.day, "date"), value: t.value })) } satisfies DashboardSummary;
  }, demoDashboard, emptyDashboard, !!branch.id || allBranches);
}

export function useSalesTrend() {
  const d = useDashboard("30d");
  return { ...d, data: d.data.trend.slice(-14) };
}

export function useEmployeeReport(range: ReportRange, branchId: string | null) {
  const { orgId } = useSession();
  const figures: Record<string, Partial<EmployeeReportRow>> = {
    e1: { salesCount: 3, revenue: 1820 }, e2: { salesCount: 18, revenue: 8140, refunds: 349, approvalsGiven: 9 },
    e3: { salesCount: 41, revenue: 21420, discounts: 55, cashVariance: 5 }, e4: { salesCount: 33, revenue: 18950, discounts: 300, cashVariance: -20 },
  };
  const demo: EmployeeReportRow[] = mock.employees.filter((e) => e.id in figures).map((e) => ({
    memberId: e.id, fullName: e.fullName, avatarColor: e.avatarColor, salesCount: 0, revenue: 0, avgSale: 498.2, discounts: 0, refunds: 0, approvalsGiven: 0, cashVariance: 0, shifts: 3, ...figures[e.id],
  }));
  return useData(["reports", "employees", orgId, branchId, range], () => http.get<EmployeeReportRow[]>("/reports/employees", { branchId, ...rangeQuery(range) }), demo, []);
}

export function usePnl(range: ReportRange, branchId: string | null) {
  const { orgId } = useSession();
  const demo: PnlReport = { grossSales: 54220, discounts: 355, refunds: 1149, taxCollected: 0, netRevenue: 52716, cogs: 40880, grossProfit: 11836, operatingExpenses: 5980, salesCount: 166 };
  const empty: PnlReport = { ...demo, grossSales: 0, discounts: 0, refunds: 0, netRevenue: 0, cogs: 0, grossProfit: 0, operatingExpenses: 0, salesCount: 0 };
  return useData(["reports", "pnl", orgId, branchId, range], () => http.get<PnlReport>("/reports/pnl", { branchId, ...rangeQuery(range) }), demo, empty);
}

export interface EmployeePerformance {
  revenue: number; salesCount: number; avgSale: number; discounts: number; discountsApproved: number;
  trend: { label: string; value: number }[];
  shifts: { id: string; closedAt: string; variance: number }[];
}
export function useEmployeePerformance(memberId: string) {
  const demo: EmployeePerformance = {
    revenue: 16764, salesCount: 45, avgSale: 342.6, discounts: 55, discountsApproved: 2,
    trend: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, i) => ({ label, value: [1200, 2100, 1650, 2400, 3100, 3900, 2414][i]! })),
    shifts: [{ id: "sh5", closedAt: new Date(Date.now() - 864e5).toISOString(), variance: 5 }],
  };
  const empty: EmployeePerformance = { ...demo, revenue: 0, salesCount: 0, avgSale: 0, discounts: 0, discountsApproved: 0, trend: [], shifts: [] };
  return useData(["reports", "performance", memberId], async () => {
    const r = await http.get<Omit<EmployeePerformance, "trend"> & { trend: { day: string; value: number }[] }>(`/reports/employees/${memberId}`, rangeQuery("7d"));
    return { ...r, trend: r.trend.map((t) => ({ label: dayLabel(t.day, "weekday"), value: t.value })) };
  }, demo, empty);
}
