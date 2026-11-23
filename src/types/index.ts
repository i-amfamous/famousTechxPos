/**
 * Domain types used by the UI. They mirror the tables in the SRS (section 6)
 * so they can be swapped for generated Supabase types later.
 */

export type ID = string;

export type EmployeeStatus = "invited" | "active" | "suspended" | "deactivated" | "deleted";
export type RoleKey =
  | "owner"
  | "admin"
  | "manager"
  | "cashier"
  | "inventory_manager"
  | "accountant"
  | (string & {});

export interface Branch {
  id: ID;
  name: string;
  code?: string;
  address: string;
  phone: string;
  status: "active" | "inactive";
  isDefault?: boolean;
}

export interface Role {
  id: ID;
  key: RoleKey;
  name: string;
  description: string;
  isSystem: boolean; // default template shipped with the app
  memberCount: number;
  limits: RoleLimits;
  permissions: string[]; // permission keys
}

export interface RoleLimits {
  maxDiscountPercent: number;
  maxRefundAmount: number;
  allowNoSale: boolean;
}

export interface Permission {
  key: string;
  label: string;
  module: string;
  sensitive?: boolean;
}

export interface Employee {
  id: ID;
  fullName: string;
  displayName: string;
  email?: string;
  phone: string;
  employeeCode: string;
  roleId: ID;
  branchIds: ID[];
  status: EmployeeStatus;
  /** Set when the account was permanently removed (soft delete). History is preserved. */
  deletedAt?: string;
  hasPin: boolean;
  pinLocked?: boolean;
  hireDate: string;
  lastSignInAt?: string;
  avatarColor: string;
  overrides: { permission: string; effect: "grant" | "revoke" }[];
  isOwner?: boolean;
}

export interface Terminal {
  id: ID;
  name: string;
  branchId: ID;
  status: "active" | "revoked";
  lastSeenAt: string;
  registeredBy: string;
}

export interface Category {
  id: ID;
  name: string;
  color: string;
}

export interface Product {
  id: ID;
  name: string;
  sku: string;
  barcode?: string;
  categoryId: ID;
  costPrice: number;
  sellingPrice: number;
  unit: string;
  taxable: boolean;
  status: "active" | "archived";
  stock: number;
  reorderLevel: number;
  variants?: { id: ID; label: string; sku: string; stock: number; barcode?: string }[];
  brand?: string;
  description?: string;
  imageUrl?: string;
}

export interface CartLine {
  productId: ID;
  variantId?: ID;
  name: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  discount: number; // amount
  /** Set when a cashier changed the price on the till (needs permission/approval). */
  priceOverride?: boolean;
}

export type PaymentMethod = "cash" | "momo" | "card" | "bank";

export interface PaymentLine {
  method: PaymentMethod;
  amount: number;
  reference?: string;
  /** Mobile money: customer number and the network detected from it. */
  phone?: string;
  network?: string;
  /** Provider status, e.g. `pending` while a request-to-pay awaits approval. */
  status?: string;
  /** Paystack Inline reference. The server verifies it before saving the sale. */
  paystackReference?: string;
}

export type SaleStatus = "completed" | "refunded" | "partially_refunded" | "voided";

export interface Sale {
  id: ID;
  receiptNumber: string;
  createdAt: string;
  cashierId: ID;
  terminalId: ID;
  shiftId: ID;
  branchId: ID;
  customerId?: ID;
  status: SaleStatus;
  items: { id?: ID; name: string; sku: string; quantity: number; unitPrice: number; discount: number; lineTotal?: number; refundedQuantity?: number }[];
  payments: PaymentLine[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  changeDue?: number;
  refundedTotal?: number;
  receipt?: SaleReceipt;
}

/** Payload returned by checkout / sale_receipt RPC. */
export interface SaleReceipt {
  saleId?: ID;
  receiptNumber: string;
  createdAt: string;
  status?: SaleStatus;
  /** Random, shareable token for the public digital receipt link. */
  shareToken?: string;
  servedBy: string;
  terminal: string;
  branch: string;
  customer?: string;
  business?: { name: string; phone?: string; tin?: string; footer?: string };
  items: { name: string; quantity: number; unitPrice: number; discount: number }[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  payments: PaymentLine[];
  /** Messages from the MoMo provider about requests sent when the sale was completed. */
  paymentNotices?: string[];
  change?: number;
}

export interface Customer {
  id: ID;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  totalSpend: number;
  visits: number;
  lastVisit?: string;
}

export interface Shift {
  id: ID;
  employeeId: ID;
  terminalId: ID;
  branchId: ID;
  status: "open" | "closed";
  openedAt: string;
  closedAt?: string;
  openingFloat: number;
  expectedCash: number;
  countedCash?: number;
  salesCount: number;
  salesTotal: number;
  byMethod: Record<PaymentMethod, number>;
  approvedBy?: ID;
  note?: string;
  variance?: number;
}

export interface CashMovement {
  id: ID;
  shiftId: ID;
  type: "paid_in" | "paid_out" | "drop" | "no_sale";
  amount: number;
  reason: string;
  actorId: ID;
  createdAt: string;
}

export interface ActivityEvent {
  id: ID;
  actorId: ID;
  action: string;
  category: "auth" | "sale" | "refund" | "discount" | "approval" | "stock" | "cash" | "employee" | "settings";
  detail: string;
  terminalId?: ID;
  branchId: ID;
  createdAt: string;
  amount?: number;
}

export interface SignInEvent {
  id: ID;
  employeeId: ID;
  method: "password" | "pin";
  success: boolean;
  device: string;
  createdAt: string;
}

export interface HeldCart {
  id: ID;
  ownerId: ID;
  note: string;
  lines: CartLine[];
  createdAt: string;
}

export interface StockMovement {
  id: ID;
  productId: ID;
  type: "sale" | "receipt" | "return" | "adjustment" | "transfer_out" | "transfer_in" | "damaged";
  delta: number;
  reason?: string;
  actorId: ID;
  createdAt: string;
}

export interface Supplier {
  id: ID;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  openOrders: number;
  balance: number;
}

export interface PurchaseOrder {
  id: ID;
  number: string;
  supplierId: ID;
  branchId: ID;
  status: "draft" | "ordered" | "partially_received" | "received" | "cancelled";
  createdAt: string;
  expectedAt?: string;
  lines: { id?: ID; productId: ID; quantity: number; received: number; unitCost: number }[];
}

export interface Expense {
  id: ID;
  date: string;
  category: string;
  description: string;
  amount: number;
  method: PaymentMethod;
  branchId: ID;
  actorId: ID;
  status: "recorded" | "voided";
  hasAttachment?: boolean;
}

export interface AppNotification {
  id: ID;
  type: "low_stock" | "refund" | "purchase" | "account" | "shift" | "security";
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

/** Member shown on a locked till (from terminal_roster). */
export interface RosterMember {
  id: ID;
  fullName: string;
  displayName: string;
  avatarColor: string;
  roleName: string;
  hasPin: boolean;
  status: EmployeeStatus;
  pinLocked: boolean;
  /** Carts parked by this employee on this till (from terminal_roster). */
  heldCount?: number;
}

export interface ShiftSummary {
  shift: Shift;
  movements: CashMovement[];
  refundsCash: number;
}

export interface DashboardSummary {
  revenue: number;
  prevRevenue: number;
  salesCount: number;
  prevSalesCount: number;
  grossProfit: number;
  expenses: number;
  expenseCount: number;
  changeGiven: number;
  byMethod: { method: PaymentMethod; amount: number }[];
  topProducts: { productId: ID; name: string; quantity: number; revenue: number }[];
  trend: { label: string; value: number }[];
  onShift: { shiftId: ID; memberId: ID; fullName: string; avatarColor: string; terminal: string; openedAt: string; salesTotal: number; salesCount: number }[];
  lowStock: { id: ID; name: string; quantity: number; reorderLevel: number }[];
}

export interface EmployeeReportRow {
  memberId: ID; fullName: string; avatarColor: string; salesCount: number; revenue: number; avgSale: number;
  discounts: number; refunds: number; approvalsGiven: number; cashVariance: number; shifts: number;
}

export interface PnlReport {
  grossSales: number; discounts: number; refunds: number; taxCollected: number; netRevenue: number; cogs: number;
  grossProfit: number; operatingExpenses: number; salesCount: number;
}

export interface Transfer {
  id: ID; number: string; fromBranchId: ID; toBranchId: ID; status: "dispatched" | "received" | "cancelled"; createdAt: string;
  items: { productId: ID; quantity: number }[];
}

export interface BarcodeLookup {
  found: boolean;
  source: "catalogue" | "online" | "none";
  product?: Product;
  online?: { name: string; brand?: string; description?: string; category?: string; images: string[]; source: string };
}
