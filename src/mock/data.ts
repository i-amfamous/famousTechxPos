/**
 * DESIGN-TIME SAMPLE DATA ONLY.
 * Used so every screen can be reviewed with realistic content. Do not ship to
 * production — replace via src/services/api.ts with real Supabase queries.
 */
import type {
  ActivityEvent, AppNotification, Branch, CashMovement, Category, Customer, Employee, Expense,
  HeldCart, Permission, Product, PurchaseOrder, Role, Sale, Shift, SignInEvent, StockMovement,
  Supplier, Terminal,
} from "@/types";

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

export const branches: Branch[] = [
  { id: "br1", name: "Accra – Osu (Main)", address: "Oxford St, Osu, Accra", phone: "030 201 4455", status: "active", isDefault: true },
  { id: "br2", name: "Kumasi – Adum", address: "Prempeh II St, Adum, Kumasi", phone: "032 202 8811", status: "active" },
  { id: "br3", name: "Takoradi – Market Circle", address: "Market Circle, Takoradi", phone: "031 202 7720", status: "inactive" },
];

export const permissions: Permission[] = [
  { key: "pos.sell", label: "Use POS and create sales", module: "POS" },
  { key: "pos.discount", label: "Apply discounts (within limit)", module: "POS" },
  { key: "pos.price_override", label: "Override item price", module: "POS", sensitive: true },
  { key: "pos.no_sale", label: "Open drawer without a sale", module: "POS", sensitive: true },
  { key: "pos.take_over_cart", label: "Resume another employee's held cart", module: "POS" },
  { key: "pos.approve", label: "Approve actions for other employees", module: "POS", sensitive: true },
  { key: "shift.open_close", label: "Open and close own shift", module: "Shifts" },
  { key: "shift.cash_movement", label: "Record cash in / out", module: "Shifts" },
  { key: "shift.view_all", label: "View all shifts and Z reports", module: "Shifts" },
  { key: "sales.view_own", label: "View own sales", module: "Sales" },
  { key: "sales.view_all", label: "View all sales", module: "Sales" },
  { key: "sales.refund", label: "Issue refunds (within limit)", module: "Sales", sensitive: true },
  { key: "sales.void", label: "Void sales", module: "Sales", sensitive: true },
  { key: "products.view", label: "View products", module: "Products" },
  { key: "products.manage", label: "Create and edit products", module: "Products" },
  { key: "inventory.adjust", label: "Adjust stock", module: "Inventory", sensitive: true },
  { key: "inventory.transfer", label: "Transfer stock between branches", module: "Inventory" },
  { key: "customers.manage", label: "Create and edit customers", module: "Customers" },
  { key: "employees.view", label: "View employees", module: "Employees" },
  { key: "employees.manage", label: "Add, edit and deactivate employees", module: "Employees", sensitive: true },
  { key: "roles.manage", label: "Edit roles and permissions", module: "Employees", sensitive: true },
  { key: "activity.view", label: "View activity log", module: "Employees" },
  { key: "expenses.manage", label: "Record expenses", module: "Expenses" },
  { key: "expenses.void", label: "Void expenses", module: "Expenses", sensitive: true },
  { key: "purchases.manage", label: "Manage suppliers and purchase orders", module: "Purchases" },
  { key: "reports.view", label: "View reports", module: "Reports", sensitive: true },
  { key: "branches.manage", label: "Manage branches", module: "Branches", sensitive: true },
  { key: "settings.manage", label: "Manage business settings and terminals", module: "Settings", sensitive: true },
];

const all = permissions.map((p) => p.key);

export const roles: Role[] = [
  { id: "r_owner", key: "owner", name: "Owner", description: "Full control of the business.", isSystem: true, memberCount: 1, limits: { maxDiscountPercent: 100, maxRefundAmount: 1_000_000, allowNoSale: true }, permissions: all },
  { id: "r_admin", key: "admin", name: "Administrator", description: "Day-to-day configuration and operations.", isSystem: true, memberCount: 0, limits: { maxDiscountPercent: 50, maxRefundAmount: 20_000, allowNoSale: true }, permissions: all.filter((k) => k !== "branches.manage") },
  { id: "r_manager", key: "manager", name: "Manager", description: "Supervises staff, sales, stock and shifts.", isSystem: true, memberCount: 1, limits: { maxDiscountPercent: 25, maxRefundAmount: 5_000, allowNoSale: true }, permissions: all.filter((k) => !["roles.manage", "branches.manage", "settings.manage"].includes(k)) },
  { id: "r_cashier", key: "cashier", name: "Cashier", description: "Sells, takes payments and prints receipts.", isSystem: true, memberCount: 4, limits: { maxDiscountPercent: 5, maxRefundAmount: 0, allowNoSale: false }, permissions: ["pos.sell", "pos.discount", "shift.open_close", "shift.cash_movement", "sales.view_own", "products.view", "customers.manage"] },
  { id: "r_inventory", key: "inventory_manager", name: "Inventory Manager", description: "Products, stock, suppliers and purchases.", isSystem: true, memberCount: 1, limits: { maxDiscountPercent: 0, maxRefundAmount: 0, allowNoSale: false }, permissions: ["products.view", "products.manage", "inventory.adjust", "inventory.transfer", "purchases.manage"] },
  { id: "r_accountant", key: "accountant", name: "Accountant", description: "Financial records, expenses and reports.", isSystem: true, memberCount: 1, limits: { maxDiscountPercent: 0, maxRefundAmount: 0, allowNoSale: false }, permissions: ["sales.view_all", "expenses.manage", "expenses.void", "reports.view", "shift.view_all"] },
  { id: "r_senior_cashier", key: "senior_cashier", name: "Senior Cashier", description: "Cashier who can approve small refunds.", isSystem: false, memberCount: 0, limits: { maxDiscountPercent: 10, maxRefundAmount: 300, allowNoSale: true }, permissions: ["pos.sell", "pos.discount", "pos.no_sale", "pos.take_over_cart", "shift.open_close", "shift.cash_movement", "sales.view_own", "sales.refund", "products.view", "customers.manage"] },
];

export const employees: Employee[] = [
  { id: "e1", fullName: "Kwame Asante", displayName: "Kwame", email: "kwame@famoustechx.com", phone: "024 555 0101", employeeCode: "FTX-001", roleId: "r_owner", branchIds: ["br1", "br2"], status: "active", hasPin: true, hireDate: "2023-02-01", lastSignInAt: ago(12), avatarColor: "bg-brand-600", overrides: [], isOwner: true },
  { id: "e2", fullName: "Ama Serwaa", displayName: "Ama", email: "ama@famoustechx.com", phone: "020 555 0202", employeeCode: "FTX-002", roleId: "r_manager", branchIds: ["br1"], status: "active", hasPin: true, hireDate: "2023-05-15", lastSignInAt: ago(40), avatarColor: "bg-violet-600", overrides: [] },
  { id: "e3", fullName: "Kofi Boateng", displayName: "Kofi", email: "kofi@famoustechx.com", phone: "054 555 0303", employeeCode: "FTX-003", roleId: "r_cashier", branchIds: ["br1"], status: "active", hasPin: true, hireDate: "2024-01-08", lastSignInAt: ago(5), avatarColor: "bg-emerald-600", overrides: [{ permission: "pos.take_over_cart", effect: "grant" }] },
  { id: "e4", fullName: "Efua Mensah", displayName: "Efua", phone: "055 555 0404", employeeCode: "FTX-004", roleId: "r_cashier", branchIds: ["br1"], status: "active", hasPin: true, hireDate: "2024-06-20", lastSignInAt: ago(180), avatarColor: "bg-amber-600", overrides: [] },
  { id: "e5", fullName: "Yaw Darko", displayName: "Yaw", email: "yaw@famoustechx.com", phone: "026 555 0505", employeeCode: "FTX-005", roleId: "r_inventory", branchIds: ["br1", "br2"], status: "active", hasPin: false, hireDate: "2023-09-11", lastSignInAt: ago(60 * 26), avatarColor: "bg-sky-600", overrides: [] },
  { id: "e6", fullName: "Abena Owusu", displayName: "Abena", email: "abena@famoustechx.com", phone: "027 555 0606", employeeCode: "FTX-006", roleId: "r_accountant", branchIds: ["br1", "br2"], status: "active", hasPin: false, hireDate: "2024-03-04", lastSignInAt: ago(60 * 50), avatarColor: "bg-rose-600", overrides: [] },
  { id: "e7", fullName: "Kojo Appiah", displayName: "Kojo", phone: "050 555 0707", employeeCode: "FTX-007", roleId: "r_cashier", branchIds: ["br2"], status: "suspended", hasPin: true, pinLocked: true, hireDate: "2024-08-01", lastSignInAt: ago(60 * 24 * 6), avatarColor: "bg-teal-600", overrides: [] },
  { id: "e8", fullName: "Akosua Frimpong", displayName: "Akosua", email: "akosua.f@gmail.com", phone: "024 555 0808", employeeCode: "FTX-008", roleId: "r_cashier", branchIds: ["br1"], status: "invited", hasPin: false, hireDate: "2026-11-18", avatarColor: "bg-fuchsia-600", overrides: [] },
  { id: "e9", fullName: "Nana Yeboah", displayName: "Nana", phone: "024 555 0909", employeeCode: "FTX-009", roleId: "r_cashier", branchIds: ["br1"], status: "deactivated", hasPin: true, hireDate: "2023-03-01", lastSignInAt: ago(60 * 24 * 90), avatarColor: "bg-ink-500", overrides: [] },
];

export const terminals: Terminal[] = [
  { id: "t1", name: "Till 1", branchId: "br1", status: "active", lastSeenAt: ago(1), registeredBy: "e1" },
  { id: "t2", name: "Till 2", branchId: "br1", status: "active", lastSeenAt: ago(8), registeredBy: "e1" },
  { id: "t3", name: "Front Desk", branchId: "br2", status: "active", lastSeenAt: ago(60 * 3), registeredBy: "e2" },
  { id: "t4", name: "Old Laptop", branchId: "br1", status: "revoked", lastSeenAt: ago(60 * 24 * 40), registeredBy: "e1" },
];

export const categories: Category[] = [
  { id: "c1", name: "Phones", color: "bg-brand-100 text-brand-800" },
  { id: "c2", name: "Accessories", color: "bg-amber-100 text-amber-800" },
  { id: "c3", name: "Audio", color: "bg-violet-100 text-violet-800" },
  { id: "c4", name: "Laptops", color: "bg-sky-100 text-sky-800" },
  { id: "c5", name: "Power", color: "bg-emerald-100 text-emerald-800" },
  { id: "c6", name: "Services", color: "bg-rose-100 text-rose-800" },
];

export const products: Product[] = [
  { id: "p1", name: "Samsung Galaxy A15", sku: "PH-SA15-128", barcode: "8806095300011", categoryId: "c1", costPrice: 1650, sellingPrice: 1999, unit: "pc", taxable: true, status: "active", stock: 14, reorderLevel: 5 },
  { id: "p2", name: "Tecno Spark 20", sku: "PH-TS20-128", barcode: "6941812700012", categoryId: "c1", costPrice: 1250, sellingPrice: 1549, unit: "pc", taxable: true, status: "active", stock: 3, reorderLevel: 5 },
  { id: "p3", name: "iPhone 13 (Refurb.)", sku: "PH-IP13-R", categoryId: "c1", costPrice: 5200, sellingPrice: 6150, unit: "pc", taxable: true, status: "active", stock: 2, reorderLevel: 2 },
  { id: "p4", name: "Infinix Hot 40i", sku: "PH-IH40I", categoryId: "c1", costPrice: 1100, sellingPrice: 1399, unit: "pc", taxable: true, status: "active", stock: 0, reorderLevel: 4 },
  { id: "p5", name: "USB-C Fast Charger 25W", sku: "AC-CH25W", barcode: "6970000000101", categoryId: "c5", costPrice: 60, sellingPrice: 120, unit: "pc", taxable: true, status: "active", stock: 48, reorderLevel: 15 },
  { id: "p6", name: "Power Bank 20,000mAh", sku: "PW-PB20K", categoryId: "c5", costPrice: 140, sellingPrice: 250, unit: "pc", taxable: true, status: "active", stock: 22, reorderLevel: 10 },
  { id: "p7", name: "Tempered Glass (Universal)", sku: "AC-TG-UNI", categoryId: "c2", costPrice: 8, sellingPrice: 35, unit: "pc", taxable: true, status: "active", stock: 160, reorderLevel: 40 },
  { id: "p8", name: "Silicone Phone Case", sku: "AC-CASE-SIL", categoryId: "c2", costPrice: 12, sellingPrice: 45, unit: "pc", taxable: true, status: "active", stock: 74, reorderLevel: 25, variants: [{ id: "v1", label: "Black", sku: "AC-CASE-SIL-BK", stock: 30 }, { id: "v2", label: "Blue", sku: "AC-CASE-SIL-BL", stock: 24 }, { id: "v3", label: "Pink", sku: "AC-CASE-SIL-PK", stock: 20 }] },
  { id: "p9", name: "Oraimo FreePods 4", sku: "AU-OR-FP4", categoryId: "c3", costPrice: 230, sellingPrice: 349, unit: "pc", taxable: true, status: "active", stock: 9, reorderLevel: 6 },
  { id: "p10", name: "JBL Go 3 Speaker", sku: "AU-JBL-GO3", categoryId: "c3", costPrice: 320, sellingPrice: 450, unit: "pc", taxable: true, status: "active", stock: 6, reorderLevel: 3 },
  { id: "p11", name: "HP 250 G9 Laptop", sku: "LP-HP250G9", categoryId: "c4", costPrice: 5400, sellingPrice: 6499, unit: "pc", taxable: true, status: "active", stock: 4, reorderLevel: 2 },
  { id: "p12", name: "Wireless Mouse", sku: "AC-MOUSE-W", categoryId: "c2", costPrice: 35, sellingPrice: 75, unit: "pc", taxable: true, status: "active", stock: 31, reorderLevel: 10 },
  { id: "p13", name: "USB-C Cable 1m", sku: "AC-CBL-C1", categoryId: "c5", costPrice: 10, sellingPrice: 40, unit: "pc", taxable: true, status: "active", stock: 95, reorderLevel: 30 },
  { id: "p14", name: "Screen Replacement Labour", sku: "SV-SCREEN", categoryId: "c6", costPrice: 0, sellingPrice: 150, unit: "job", taxable: false, status: "active", stock: 0, reorderLevel: 0 },
  { id: "p15", name: "Phone Software Flash", sku: "SV-FLASH", categoryId: "c6", costPrice: 0, sellingPrice: 80, unit: "job", taxable: false, status: "active", stock: 0, reorderLevel: 0 },
  { id: "p16", name: "Memory Card 64GB", sku: "AC-SD64", categoryId: "c2", costPrice: 45, sellingPrice: 90, unit: "pc", taxable: true, status: "archived", stock: 0, reorderLevel: 0 },
];

export const customers: Customer[] = [
  { id: "cu1", name: "Esi Quaye", phone: "024 111 2233", email: "esi.q@gmail.com", address: "East Legon, Accra", totalSpend: 8240, visits: 7, lastVisit: ago(60 * 26) },
  { id: "cu2", name: "Daniel Ofori", phone: "020 333 4455", totalSpend: 1999, visits: 1, lastVisit: ago(60 * 3) },
  { id: "cu3", name: "Mavis Adjei", phone: "054 777 8899", email: "mavis@adjeiventures.com", address: "Spintex Rd, Accra", notes: "Business buyer — prefers MoMo.", totalSpend: 23410, visits: 15, lastVisit: ago(60 * 24 * 4) },
  { id: "cu4", name: "Samuel Tetteh", phone: "026 999 0011", totalSpend: 450, visits: 2, lastVisit: ago(60 * 24 * 12) },
  { id: "cu5", name: "Gifty Amponsah", phone: "055 222 3344", totalSpend: 3120, visits: 4, lastVisit: ago(60 * 24 * 2) },
];

export const sales: Sale[] = [
  { id: "s1", receiptNumber: "OSU-T1-000482", createdAt: ago(6), cashierId: "e3", terminalId: "t1", shiftId: "sh1", branchId: "br1", customerId: "cu2", status: "completed", items: [{ name: "Samsung Galaxy A15", sku: "PH-SA15-128", quantity: 1, unitPrice: 1999, discount: 0 }, { name: "Tempered Glass (Universal)", sku: "AC-TG-UNI", quantity: 1, unitPrice: 35, discount: 0 }], payments: [{ method: "momo", amount: 2034, reference: "MTN 7781230091" }], subtotal: 2034, discountTotal: 0, taxTotal: 0, total: 2034 },
  { id: "s2", receiptNumber: "OSU-T1-000481", createdAt: ago(19), cashierId: "e3", terminalId: "t1", shiftId: "sh1", branchId: "br1", status: "completed", items: [{ name: "USB-C Fast Charger 25W", sku: "AC-CH25W", quantity: 2, unitPrice: 120, discount: 10 }], payments: [{ method: "cash", amount: 230 }], subtotal: 240, discountTotal: 10, taxTotal: 0, total: 230 },
  { id: "s3", receiptNumber: "OSU-T2-000233", createdAt: ago(44), cashierId: "e2", terminalId: "t2", shiftId: "sh2", branchId: "br1", customerId: "cu3", status: "partially_refunded", items: [{ name: "Oraimo FreePods 4", sku: "AU-OR-FP4", quantity: 2, unitPrice: 349, discount: 0 }, { name: "Silicone Phone Case", sku: "AC-CASE-SIL-BK", quantity: 3, unitPrice: 45, discount: 0 }], payments: [{ method: "cash", amount: 500 }, { method: "momo", amount: 333, reference: "VOD 551200341" }], subtotal: 833, discountTotal: 0, taxTotal: 0, total: 833 },
  { id: "s4", receiptNumber: "OSU-T1-000480", createdAt: ago(75), cashierId: "e3", terminalId: "t1", shiftId: "sh1", branchId: "br1", status: "completed", items: [{ name: "Screen Replacement Labour", sku: "SV-SCREEN", quantity: 1, unitPrice: 150, discount: 0 }], payments: [{ method: "cash", amount: 150 }], subtotal: 150, discountTotal: 0, taxTotal: 0, total: 150 },
  { id: "s5", receiptNumber: "OSU-T2-000232", createdAt: ago(130), cashierId: "e4", terminalId: "t2", shiftId: "sh3", branchId: "br1", customerId: "cu1", status: "completed", items: [{ name: "HP 250 G9 Laptop", sku: "LP-HP250G9", quantity: 1, unitPrice: 6499, discount: 300 }, { name: "Wireless Mouse", sku: "AC-MOUSE-W", quantity: 1, unitPrice: 75, discount: 0 }], payments: [{ method: "card", amount: 4000, reference: "POS 0034" }, { method: "bank", amount: 2274, reference: "GCB trf" }], subtotal: 6574, discountTotal: 300, taxTotal: 0, total: 6274 },
  { id: "s6", receiptNumber: "OSU-T1-000479", createdAt: ago(210), cashierId: "e4", terminalId: "t1", shiftId: "sh3", branchId: "br1", status: "refunded", items: [{ name: "JBL Go 3 Speaker", sku: "AU-JBL-GO3", quantity: 1, unitPrice: 450, discount: 0 }], payments: [{ method: "cash", amount: 450 }], subtotal: 450, discountTotal: 0, taxTotal: 0, total: 450 },
  { id: "s7", receiptNumber: "ADM-T3-000118", createdAt: ago(260), cashierId: "e2", terminalId: "t3", shiftId: "sh4", branchId: "br2", customerId: "cu5", status: "completed", items: [{ name: "Power Bank 20,000mAh", sku: "PW-PB20K", quantity: 2, unitPrice: 250, discount: 0 }], payments: [{ method: "momo", amount: 500, reference: "AT 220019922" }], subtotal: 500, discountTotal: 0, taxTotal: 0, total: 500 },
  { id: "s8", receiptNumber: "OSU-T1-000478", createdAt: ago(60 * 22), cashierId: "e3", terminalId: "t1", shiftId: "sh5", branchId: "br1", status: "voided", items: [{ name: "USB-C Cable 1m", sku: "AC-CBL-C1", quantity: 1, unitPrice: 40, discount: 0 }], payments: [{ method: "cash", amount: 40 }], subtotal: 40, discountTotal: 0, taxTotal: 0, total: 40 },
];

export const shifts: Shift[] = [
  { id: "sh1", employeeId: "e3", terminalId: "t1", branchId: "br1", status: "open", openedAt: ago(60 * 4), openingFloat: 300, expectedCash: 680, salesCount: 14, salesTotal: 6420, byMethod: { cash: 1380, momo: 4210, card: 830, bank: 0 } },
  { id: "sh2", employeeId: "e2", terminalId: "t2", branchId: "br1", status: "open", openedAt: ago(60 * 3), openingFloat: 200, expectedCash: 700, salesCount: 6, salesTotal: 2140, byMethod: { cash: 500, momo: 1640, card: 0, bank: 0 } },
  { id: "sh3", employeeId: "e4", terminalId: "t2", branchId: "br1", status: "closed", openedAt: ago(60 * 9), closedAt: ago(60 * 4), openingFloat: 300, expectedCash: 1450, countedCash: 1430, salesCount: 22, salesTotal: 11980, byMethod: { cash: 1600, momo: 6106, card: 4000, bank: 2274 }, approvedBy: "e2", note: "GH₵ 20 short — customer change error, noted." },
  { id: "sh4", employeeId: "e2", terminalId: "t3", branchId: "br2", status: "closed", openedAt: ago(60 * 30), closedAt: ago(60 * 21), openingFloat: 200, expectedCash: 920, countedCash: 920, salesCount: 11, salesTotal: 4310, byMethod: { cash: 720, momo: 3590, card: 0, bank: 0 } },
  { id: "sh5", employeeId: "e3", terminalId: "t1", branchId: "br1", status: "closed", openedAt: ago(60 * 32), closedAt: ago(60 * 23), openingFloat: 300, expectedCash: 2210, countedCash: 2215, salesCount: 27, salesTotal: 9875, byMethod: { cash: 1910, momo: 5465, card: 2500, bank: 0 } },
];

export const cashMovements: CashMovement[] = [
  { id: "cm1", shiftId: "sh1", type: "paid_out", amount: 50, reason: "Bought printer paper", actorId: "e3", createdAt: ago(120) },
  { id: "cm2", shiftId: "sh1", type: "drop", amount: 1000, reason: "Moved to safe", actorId: "e2", createdAt: ago(60) },
  { id: "cm3", shiftId: "sh1", type: "paid_in", amount: 50, reason: "Extra change from manager", actorId: "e2", createdAt: ago(200) },
];

export const activity: ActivityEvent[] = [
  { id: "a1", actorId: "e3", action: "Completed sale", category: "sale", detail: "OSU-T1-000482 · Mobile Money", terminalId: "t1", branchId: "br1", createdAt: ago(6), amount: 2034 },
  { id: "a2", actorId: "e3", action: "Signed in with PIN", category: "auth", detail: "Switched from Ama Serwaa", terminalId: "t1", branchId: "br1", createdAt: ago(9) },
  { id: "a3", actorId: "e2", action: "Approved discount", category: "approval", detail: "GH₵ 10 on OSU-T1-000481 requested by Kofi Boateng", terminalId: "t1", branchId: "br1", createdAt: ago(19), amount: 10 },
  { id: "a4", actorId: "e2", action: "Issued partial refund", category: "refund", detail: "1 × Oraimo FreePods 4 on OSU-T2-000233 · Faulty left earbud", terminalId: "t2", branchId: "br1", createdAt: ago(35), amount: 349 },
  { id: "a5", actorId: "e2", action: "Cash drop", category: "cash", detail: "GH₵ 1,000 moved to safe from Till 1", terminalId: "t1", branchId: "br1", createdAt: ago(60), amount: 1000 },
  { id: "a6", actorId: "e5", action: "Stock adjustment", category: "stock", detail: "Tecno Spark 20: −1 (Damaged in display)", branchId: "br1", createdAt: ago(95) },
  { id: "a7", actorId: "e1", action: "Changed permissions", category: "employee", detail: "Granted “Resume another employee's held cart” to Kofi Boateng", branchId: "br1", createdAt: ago(60 * 5) },
  { id: "a8", actorId: "e4", action: "Closed shift", category: "cash", detail: "Till 2 · variance −GH₵ 20 · approved by Ama Serwaa", terminalId: "t2", branchId: "br1", createdAt: ago(60 * 4) },
  { id: "a9", actorId: "e7", action: "PIN locked", category: "auth", detail: "5 failed PIN attempts on Front Desk", terminalId: "t3", branchId: "br2", createdAt: ago(60 * 24 * 6) },
  { id: "a10", actorId: "e1", action: "Suspended employee", category: "employee", detail: "Kojo Appiah — pending investigation", branchId: "br2", createdAt: ago(60 * 24 * 6 - 30) },
  { id: "a11", actorId: "e1", action: "Updated receipt footer", category: "settings", detail: "Business settings", branchId: "br1", createdAt: ago(60 * 24 * 2) },
];

export const signIns: SignInEvent[] = [
  { id: "si1", employeeId: "e3", method: "pin", success: true, device: "Till 1 · Osu", createdAt: ago(9) },
  { id: "si2", employeeId: "e3", method: "pin", success: false, device: "Till 1 · Osu", createdAt: ago(10) },
  { id: "si3", employeeId: "e3", method: "password", success: true, device: "Chrome · Windows", createdAt: ago(60 * 4) },
  { id: "si4", employeeId: "e3", method: "pin", success: true, device: "Till 1 · Osu", createdAt: ago(60 * 26) },
];

export const heldCarts: HeldCart[] = [
  { id: "h1", ownerId: "e3", note: "Customer went to get cash", createdAt: ago(14), lines: [{ productId: "p10", name: "JBL Go 3 Speaker", sku: "AU-JBL-GO3", unitPrice: 450, quantity: 1, discount: 0 }] },
  { id: "h2", ownerId: "e2", note: "Mr. Ofori – waiting for colour choice", createdAt: ago(52), lines: [{ productId: "p8", name: "Silicone Phone Case", sku: "AC-CASE-SIL", unitPrice: 45, quantity: 2, discount: 0 }, { productId: "p7", name: "Tempered Glass (Universal)", sku: "AC-TG-UNI", unitPrice: 35, quantity: 2, discount: 0 }] },
];

export const stockMovements: StockMovement[] = [
  { id: "m1", productId: "p1", type: "sale", delta: -1, actorId: "e3", createdAt: ago(6) },
  { id: "m2", productId: "p9", type: "return", delta: 1, reason: "Refund OSU-T2-000233 — not resalable, moved to damaged", actorId: "e2", createdAt: ago(35) },
  { id: "m3", productId: "p2", type: "damaged", delta: -1, reason: "Damaged in display", actorId: "e5", createdAt: ago(95) },
  { id: "m4", productId: "p5", type: "receipt", delta: 30, reason: "PO-0041 received", actorId: "e5", createdAt: ago(60 * 20) },
  { id: "m5", productId: "p6", type: "transfer_out", delta: -5, reason: "To Kumasi – Adum (TR-0007)", actorId: "e5", createdAt: ago(60 * 28) },
  { id: "m6", productId: "p12", type: "adjustment", delta: 2, reason: "Stock count correction", actorId: "e5", createdAt: ago(60 * 50) },
];

export const suppliers: Supplier[] = [
  { id: "su1", name: "Kantamanto Gadget Wholesale", phone: "024 600 1100", email: "sales@kgw.com.gh", address: "Kantamanto, Accra", openOrders: 1, balance: 4200 },
  { id: "su2", name: "Transsion Ghana Distributors", phone: "030 290 4400", email: "orders@tgd.com.gh", address: "Ring Rd Central, Accra", openOrders: 1, balance: 0 },
  { id: "su3", name: "Oraimo West Africa", phone: "030 255 9090", email: "b2b@oraimo.com", openOrders: 0, balance: 0 },
];

export const purchaseOrders: PurchaseOrder[] = [
  { id: "po1", number: "PO-0042", supplierId: "su2", branchId: "br1", status: "ordered", createdAt: ago(60 * 24 * 2), expectedAt: ago(-60 * 24 * 2), lines: [{ productId: "p2", quantity: 10, received: 0, unitCost: 1250 }, { productId: "p4", quantity: 8, received: 0, unitCost: 1100 }] },
  { id: "po2", number: "PO-0041", supplierId: "su1", branchId: "br1", status: "partially_received", createdAt: ago(60 * 24 * 4), lines: [{ productId: "p5", quantity: 50, received: 30, unitCost: 60 }, { productId: "p13", quantity: 100, received: 100, unitCost: 10 }] },
  { id: "po3", number: "PO-0040", supplierId: "su3", branchId: "br2", status: "received", createdAt: ago(60 * 24 * 10), lines: [{ productId: "p9", quantity: 12, received: 12, unitCost: 230 }] },
  { id: "po4", number: "PO-0043", supplierId: "su1", branchId: "br1", status: "draft", createdAt: ago(60 * 3), lines: [{ productId: "p7", quantity: 200, received: 0, unitCost: 8 }] },
];

export const expenses: Expense[] = [
  { id: "x1", date: ago(60 * 5), category: "Utilities", description: "ECG prepaid top-up", amount: 600, method: "momo", branchId: "br1", actorId: "e6", status: "recorded", hasAttachment: true },
  { id: "x2", date: ago(60 * 24), category: "Transport", description: "Delivery to Kumasi branch", amount: 250, method: "cash", branchId: "br1", actorId: "e2", status: "recorded" },
  { id: "x3", date: ago(60 * 24 * 3), category: "Rent", description: "Osu shop rent — November", amount: 4500, method: "bank", branchId: "br1", actorId: "e6", status: "recorded", hasAttachment: true },
  { id: "x4", date: ago(60 * 24 * 4), category: "Supplies", description: "Receipt paper rolls (x20)", amount: 180, method: "cash", branchId: "br1", actorId: "e2", status: "voided" },
  { id: "x5", date: ago(60 * 24 * 6), category: "Internet", description: "Fibre broadband", amount: 450, method: "momo", branchId: "br2", actorId: "e6", status: "recorded" },
];

export const notifications: AppNotification[] = [
  { id: "n1", type: "low_stock", title: "Low stock: Tecno Spark 20", body: "3 left at Accra – Osu (reorder level 5).", createdAt: ago(30), read: false },
  { id: "n2", type: "shift", title: "Shift variance approved", body: "Efua Mensah closed Till 2 with −GH₵ 20 variance. Approved by Ama Serwaa.", createdAt: ago(60 * 4), read: false },
  { id: "n3", type: "security", title: "PIN locked: Kojo Appiah", body: "5 failed PIN attempts on Front Desk, Kumasi – Adum.", createdAt: ago(60 * 24 * 6), read: true },
  { id: "n4", type: "refund", title: "Partial refund issued", body: "GH₵ 349.00 on OSU-T2-000233 by Ama Serwaa.", createdAt: ago(35), read: false },
  { id: "n5", type: "purchase", title: "PO-0041 partially received", body: "30 of 50 USB-C Fast Charger 25W received.", createdAt: ago(60 * 20), read: true },
  { id: "n6", type: "account", title: "Invite pending", body: "Akosua Frimpong hasn't accepted their invite yet.", createdAt: ago(60 * 24 * 3), read: true },
];

/** 14 days of sales totals for dashboard charts */
export const salesTrend = [8200, 9400, 7600, 11200, 10400, 12900, 6400, 9100, 10800, 9900, 13400, 12100, 14800, 8560].map((v, i, a) => ({
  label: new Date(Date.now() - (a.length - 1 - i) * 86_400_000).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
  value: v,
}));
