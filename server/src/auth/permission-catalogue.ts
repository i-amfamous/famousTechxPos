/** The permission catalogue, default roles and plans. The single source of truth for what can be granted. */
import { one, type Db } from "../core/db.js";

export const PERMISSIONS: [key: string, label: string, module: string, sensitive: boolean][] = [
  ["pos.sell", "Use POS and create sales", "POS", false],
  ["pos.discount", "Apply discounts (within limit)", "POS", false],
  ["pos.price_override", "Override item price", "POS", true],
  ["pos.no_sale", "Open drawer without a sale", "POS", true],
  ["pos.take_over_cart", "Resume another employee's held cart", "POS", false],
  ["pos.approve", "Approve actions for other employees", "POS", true],
  ["shift.open_close", "Open and close own shift", "Shifts", false],
  ["shift.cash_movement", "Record cash in / out", "Shifts", false],
  ["shift.view_all", "View all shifts and Z reports", "Shifts", false],
  ["sales.view_own", "View own sales", "Sales", false],
  ["sales.view_all", "View all sales", "Sales", false],
  ["sales.refund", "Issue refunds (within limit)", "Sales", true],
  ["sales.void", "Void sales", "Sales", true],
  ["products.view", "View products", "Products", false],
  ["products.manage", "Create and edit products", "Products", false],
  ["inventory.adjust", "Adjust and receive stock", "Inventory", true],
  ["inventory.transfer", "Transfer stock between branches", "Inventory", false],
  ["customers.manage", "Create and edit customers", "Customers", false],
  ["employees.view", "View employees", "Employees", false],
  ["employees.manage", "Add, edit and deactivate employees", "Employees", true],
  ["roles.manage", "Edit roles and permissions", "Employees", true],
  ["activity.view", "View activity log", "Employees", false],
  ["expenses.manage", "Record expenses", "Expenses", false],
  ["expenses.void", "Void expenses", "Expenses", true],
  ["purchases.manage", "Manage suppliers and purchase orders", "Purchases", false],
  ["reports.view", "View reports", "Reports", true],
  ["branches.manage", "Manage branches", "Branches", true],
  ["settings.manage", "Manage business settings and tills", "Settings", true],
];

export const ALL_PERMS = PERMISSIONS.map((p) => p[0]);

export const DEFAULT_ROLES: { key: string; name: string; description: string; discount: number; refund: number; noSale: boolean; perms: string[] }[] = [
  { key: "owner", name: "Owner", description: "Full control of the business.", discount: 100, refund: 100_000_000, noSale: true, perms: ALL_PERMS },
  { key: "admin", name: "Administrator", description: "Day-to-day configuration and operations.", discount: 50, refund: 20000, noSale: true, perms: ALL_PERMS.filter((k) => k !== "branches.manage") },
  { key: "manager", name: "Manager", description: "Supervises staff, sales, stock and shifts.", discount: 25, refund: 5000, noSale: true, perms: ALL_PERMS.filter((k) => !["roles.manage", "branches.manage", "settings.manage"].includes(k)) },
  { key: "cashier", name: "Cashier", description: "Sells, takes payments and prints receipts.", discount: 5, refund: 0, noSale: false, perms: ["pos.sell", "pos.discount", "shift.open_close", "shift.cash_movement", "sales.view_own", "products.view", "customers.manage"] },
  { key: "inventory_manager", name: "Inventory Manager", description: "Products, stock, suppliers and purchases.", discount: 0, refund: 0, noSale: false, perms: ["products.view", "products.manage", "inventory.adjust", "inventory.transfer", "purchases.manage"] },
  { key: "accountant", name: "Accountant", description: "Financial records, expenses and reports.", discount: 0, refund: 0, noSale: false, perms: ["sales.view_all", "expenses.manage", "expenses.void", "reports.view", "shift.view_all"] },
];

/** Seeds the global permission catalogue and plans (idempotent). */
export async function seedReferenceData(db: Db) {
  for (const [i, [key, label, module, sensitive]] of PERMISSIONS.entries()) {
    const ex = await one(db, "SELECT perm_key FROM permissions WHERE perm_key = ?", [key]);
    if (ex) await db.run("UPDATE permissions SET label = ?, module = ?, sensitive = ?, sort = ? WHERE perm_key = ?", [label, module, sensitive, i, key]);
    else await db.run("INSERT INTO permissions (perm_key, label, module, sensitive, sort) VALUES (?,?,?,?,?)", [key, label, module, sensitive, i]);
  }
  for (const [id, name, members, branches] of [["starter", "Starter", 3, 1], ["business", "Business", 10, 3], ["enterprise", "Enterprise", 1000, 100]] as const) {
    if (!(await one(db, "SELECT id FROM subscription_plans WHERE id = ?", [id])))
      await db.run("INSERT INTO subscription_plans (id, name, max_members, max_branches) VALUES (?,?,?,?)", [id, name, members, branches]);
  }
}
