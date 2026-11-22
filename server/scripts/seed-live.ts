/**
 * Seeds realistic, clearly-labelled demo data into the LIVE database.
 * - Products use SKU prefix `SEED-` and names starting `Seed ·`.
 * - Sales use idempotency keys `seed-<n>` and receipts `SEED-…`.
 * - Customers are named `Seed Customer …`.
 * Run:  node --import tsx scripts/seed-live.ts
 * Clean: node --import tsx scripts/seed-live.ts --clean
 * Options: --products=320 --sales=240 --force
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import mysql, { type Pool } from "mysql2/promise";

const args = new Set(process.argv.slice(2));
const arg = (name: string, fallback: number) => {
  const found = [...args].find((a) => a.startsWith(`--${name}=`));
  return found ? Number(found.split("=")[1]) || fallback : fallback;
};
const PRODUCTS = arg("products", 320);
const SALES = arg("sales", 240);

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const line = env.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
if (!line) throw new Error("DATABASE_URL not found in server/.env");
const databaseUrl = line.slice("DATABASE_URL=".length).trim().replace(/\/sys(\?|$)/, "/famous_pos$1");

const pool: Pool = mysql.createPool({ uri: databaseUrl, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: false }, connectionLimit: 6 });
const run = (sql: string, params: unknown[] = []) => pool.query(sql, params);
const stamp = (d: Date) => d.toISOString().slice(0, 23).replace("T", " ");
const money = (n: number) => Math.round(n * 100) / 100;
let seed = 20261122;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]!;
const between = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

const CATEGORY_NAMES = ["Phones & Tablets", "Laptops", "Printers & Ink", "Accessories", "Stationery", "Design Services", "Networking", "Power & Cables"];
const BASE: Record<string, string[]> = {
  "Phones & Tablets": ["Smartphone", "Android Phone", "Tablet", "Phone Case", "Screen Protector", "Charging Dock"],
  "Laptops": ["Laptop", "Business Laptop", "Laptop Stand", "Laptop Bag", "Wireless Mouse", "Keyboard"],
  "Printers & Ink": ["Ink Cartridge", "Toner", "Photo Printer", "Label Printer", "Printer Paper", "Print Head"],
  "Accessories": ["USB Hub", "Memory Card", "Bluetooth Speaker", "Headphones", "Webcam", "Cable Organiser"],
  "Stationery": ["Notebook", "Ballpoint Pen", "A4 File", "Stapler", "Marker Set", "Envelope Pack"],
  "Design Services": ["Logo Design", "Flyer Design", "Business Card Design", "Photo Retouch", "Poster Design", "Brand Guide"],
  "Networking": ["Router", "Network Switch", "Ethernet Cable", "WiFi Extender", "Network Adapter", "Patch Panel"],
  "Power & Cables": ["Power Bank", "USB-C Cable", "Wall Charger", "Surge Protector", "HDMI Cable", "Battery Pack"],
};
const IMAGES: Record<string, string> = {
  "Phones & Tablets": "1511707171634-5f897ff02aa9",
  "Laptops": "1496181133206-80ce9b88a853",
  "Printers & Ink": "1612815154858-60aa4c59eaa6",
  "Accessories": "1505740420928-5e560c06d30e",
  "Stationery": "1455390582262-044cdead277a",
  "Design Services": "1626785774573-4b799315345d",
  "Networking": "1544197150-b99a580bb7a8",
  "Power & Cables": "1583394838336-acd977736f90",
};
const cover = (cat: string) => `https://images.unsplash.com/photo-${IMAGES[cat] ?? IMAGES.Accessories}?auto=format&fit=crop&w=480&h=360&q=75`;

const FIRST = ["Kwame", "Akosua", "Kofi", "Ama", "Yaw", "Efua", "Kwabena", "Abena", "Daniel", "Esi"];
const LAST = ["Mensah", "Quaye", "Boateng", "Osei", "Adjei", "Frimpong", "Tetteh", "Asante", "Nkrumah", "Owusu"];

async function clean(org: string) {
  const [sales] = await run("SELECT id FROM sales WHERE organization_id=? AND idempotency_key LIKE 'seed-%'", [org]);
  const saleIds = (sales as { id: string }[]).map((s) => s.id);
  for (let i = 0; i < saleIds.length; i += 200) {
    const chunk = saleIds.slice(i, i + 200);
    const q = chunk.map(() => "?").join(",");
    await run(`DELETE FROM payments WHERE sale_id IN (${q})`, chunk);
    await run(`DELETE FROM sale_items WHERE sale_id IN (${q})`, chunk);
    await run(`DELETE FROM stock_movements WHERE reference_type='sale' AND reference_id IN (${q})`, chunk);
    await run(`DELETE FROM sales WHERE id IN (${q})`, chunk);
  }
  const [products] = await run("SELECT id FROM products WHERE organization_id=? AND sku LIKE 'SEED-%'", [org]);
  const productIds = (products as { id: string }[]).map((p) => p.id);
  for (let i = 0; i < productIds.length; i += 200) {
    const chunk = productIds.slice(i, i + 200);
    const q = chunk.map(() => "?").join(",");
    await run(`DELETE FROM stock_movements WHERE product_id IN (${q})`, chunk);
    await run(`DELETE FROM inventory WHERE product_id IN (${q})`, chunk);
    await run(`DELETE FROM products WHERE id IN (${q})`, chunk);
  }
  await run("DELETE FROM customers WHERE organization_id=? AND name LIKE 'Seed Customer %'", [org]);
  await run("DELETE FROM categories WHERE organization_id=? AND name LIKE 'Seed %'", [org]);
  console.log(`Cleaned ${saleIds.length} seeded sales and ${productIds.length} seeded products.`);
}

async function main() {
  const [bizRows] = await run("SELECT id FROM businesses ORDER BY created_at LIMIT 1");
  const [branchRows] = await run("SELECT id, code FROM branches ORDER BY created_at LIMIT 1");
  const [terminalRows] = await run("SELECT id, code FROM pos_terminals ORDER BY created_at LIMIT 1");
  const [memberRows] = await run("SELECT id FROM business_members WHERE is_owner=1 ORDER BY created_at LIMIT 1");
  const [shiftRows] = await run("SELECT id FROM shifts WHERE status='open' ORDER BY opened_at DESC LIMIT 1");
  const org = (bizRows as { id: string }[])[0]?.id;
  const branch = (branchRows as { id: string; code: string }[])[0];
  const terminal = (terminalRows as { id: string; code: string }[])[0];
  const cashier = (memberRows as { id: string }[])[0]?.id;
  const shift = (shiftRows as { id: string }[])[0]?.id;
  if (!org || !branch || !terminal || !cashier) throw new Error("Business, branch, till or owner missing — finish onboarding first.");

  if (args.has("--clean")) { await clean(org); if (!args.has("--force")) return; }
  const [already] = await run("SELECT COUNT(*) AS n FROM products WHERE organization_id=? AND sku LIKE 'SEED-%'", [org]);
  if ((already as { n: number }[])[0]!.n > 0 && !args.has("--force")) {
    console.log("Seed data already present. Use --clean or --force to replace it.");
    return;
  }

  const started = Date.now();
  const [catRows] = await run("SELECT id,name FROM categories WHERE organization_id=?", [org]);
  const catMap = new Map((catRows as { id: string; name: string }[]).map((c) => [c.name, c.id]));
  for (const name of CATEGORY_NAMES) {
    if (catMap.has(name)) continue;
    const id = randomUUID();
    await run("INSERT INTO categories (id,organization_id,name,color,created_at) VALUES (?,?,?,?,?)", [id, org, name, "bg-sky-100 text-sky-800", stamp(new Date())]);
    catMap.set(name, id);
  }

  type Product = { id: string; name: string; sku: string; barcode: string; image: string; cost: number; price: number; cat: string; stock: number };
  const products: Product[] = [];
  const invRows: unknown[][] = [];
  const movementRows: unknown[][] = [];
  const now = stamp(new Date());
  for (let i = 0; i < PRODUCTS; i++) {
    const cat = CATEGORY_NAMES[i % CATEGORY_NAMES.length]!;
    const base = pick(BASE[cat]!);
    const cost = money(between(4, 180) + rnd());
    const price = money(cost * (1.25 + rnd() * 0.7));
    const stock = between(18, 120);
    products.push({ id: randomUUID(), name: `Seed · ${base} ${String(i + 1).padStart(3, "0")}`, sku: `SEED-${String(i + 1).padStart(4, "0")}`, barcode: `690${String(i + 1).padStart(10, "0")}`, image: cover(cat), cost, price, cat, stock });
    invRows.push([randomUUID(), org, branch.id, products[i]!.id, "", stock, now]);
    movementRows.push([randomUUID(), org, branch.id, products[i]!.id, null, "opening", stock, 0, stock, "Seed opening stock", "seed", null, cashier, now]);
  }
  for (let i = 0; i < products.length; i += 100) {
    const chunk = products.slice(i, i + 100);
    await run(`INSERT INTO products (id,organization_id,category_id,name,brand,description,image_url,sku,barcode,cost_price,selling_price,unit,taxable,reorder_level,status,created_at,updated_at) VALUES ${chunk.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",")}`,
      chunk.flatMap((p) => [p.id, org, catMap.get(p.cat), p.name, "Seed Brands", "Seeded demo product for testing", p.image, p.sku, p.barcode, p.cost, p.price, p.cat === "Design Services" ? "job" : "pc", 1, 8, "active", now, now]));
  }
  for (let i = 0; i < invRows.length; i += 100) {
    await run(`INSERT INTO inventory (id,organization_id,branch_id,product_id,variant_key,quantity,updated_at) VALUES ${invRows.slice(i, i + 100).map(() => "(?,?,?,?,?,?,?)").join(",")}`, invRows.slice(i, i + 100).flat());
  }
  for (let i = 0; i < movementRows.length; i += 100) {
    await run(`INSERT INTO stock_movements (id,organization_id,branch_id,product_id,variant_id,movement_type,quantity_delta,quantity_before,quantity_after,reason,reference_type,reference_id,actor_id,created_at) VALUES ${movementRows.slice(i, i + 100).map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",")}`, movementRows.slice(i, i + 100).flat());
  }
  console.log(`Seeded ${products.length} products.`);

  const customers: { id: string; name: string }[] = [];
  const customerRows: unknown[][] = [];
  for (let i = 0; i < 30; i++) {
    const c = { id: randomUUID(), name: `Seed Customer ${FIRST[i % FIRST.length]!} ${LAST[(i * 3) % LAST.length]!}` };
    customers.push(c);
    customerRows.push([c.id, org, c.name, `024${String(1000000 + i).padStart(7, "0")}`, null, null, "Seeded customer", "active", 0, 0, null, now]);
  }
  await run(`INSERT INTO customers (id,organization_id,name,phone,email,address,notes,status,total_spend,visits,last_visit_at,created_at) VALUES ${customerRows.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?)").join(",")}`, customerRows.flat());

  const saleRows: unknown[][] = [];
  const itemRows: unknown[][] = [];
  const payRows: unknown[][] = [];
  const saleMoves: unknown[][] = [];
  const customerTotals = new Map<string, { spend: number; visits: number; last: string }>();
  const METHODS = ["cash", "momo", "card", "bank"];
  for (let i = 0; i < SALES; i++) {
    const created = new Date(Date.now() - (i % 90) * 86400000 - between(0, 20) * 3600000);
    const createdAt = stamp(created);
    const receipt = `SEED-${String(i + 1).padStart(6, "0")}`;
    const saleId = randomUUID();
    const customer = rnd() > 0.25 ? pick(customers) : null;
    const lineCount = between(1, 4);
    let subtotal = 0, cost = 0, tax = 0;
    const lines: { p: Product; qty: number; price: number; total: number }[] = [];
    for (let j = 0; j < lineCount; j++) {
      const p = pick(products);
      const qty = between(1, 4);
      const price = p.price;
      const total = money(price * qty);
      subtotal += total;
      cost += money(p.cost * qty);
      tax += money(total * 0.03);
      lines.push({ p, qty, price, total });
      itemRows.push([randomUUID(), org, saleId, p.id, null, p.name, p.sku, qty, price, p.cost, 0, money(total * 0.03), total, 0]);
      saleMoves.push([randomUUID(), org, branch.id, p.id, null, "sale", -qty, null, null, "Seed sale", "sale", saleId, cashier, createdAt]);
    }
    const taxTotal = money(tax);
    const total = money(subtotal + taxTotal);
    const method = pick(METHODS);
    const idempotency = `seed-${i + 1}`;
    saleRows.push([saleId, org, branch.id, terminal.id, shift ?? null, cashier, customer?.id ?? null, receipt, idempotency, "completed",
      money(subtotal), 0, taxTotal, total, total, 0, money(cost), 0, null, null, null, null, createdAt]);
    payRows.push([randomUUID(), org, saleId, method, total, "recorded", `seed-${i + 1}`, cashier, createdAt]);
    if (customer) {
      const t = customerTotals.get(customer.id) ?? { spend: 0, visits: 0, last: createdAt };
      t.spend += total; t.visits++; if (createdAt > t.last) t.last = createdAt;
      customerTotals.set(customer.id, t);
    }
  }
  for (let i = 0; i < saleRows.length; i += 100) {
    await run(`INSERT INTO sales (id,organization_id,branch_id,terminal_id,shift_id,cashier_id,customer_id,receipt_number,idempotency_key,status,subtotal,discount_total,tax_total,total,paid_total,change_due,cost_total,refunded_total,discount_approval_id,void_reason,voided_by,voided_at,created_at) VALUES ${saleRows.slice(i, i + 100).map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",")}`, saleRows.slice(i, i + 100).flat());
  }
  for (let i = 0; i < itemRows.length; i += 150) {
    await run(`INSERT INTO sale_items (id,organization_id,sale_id,product_id,variant_id,name_snapshot,sku_snapshot,quantity,unit_price,cost_snapshot,discount,tax,line_total,refunded_quantity) VALUES ${itemRows.slice(i, i + 150).map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",")}`, itemRows.slice(i, i + 150).flat());
  }
  for (let i = 0; i < payRows.length; i += 150) {
    await run(`INSERT INTO payments (id,organization_id,sale_id,method,amount,status,provider_reference,recorded_by,created_at) VALUES ${payRows.slice(i, i + 150).map(() => "(?,?,?,?,?,?,?,?,?)").join(",")}`, payRows.slice(i, i + 150).flat());
  }
  for (let i = 0; i < saleMoves.length; i += 150) {
    await run(`INSERT INTO stock_movements (id,organization_id,branch_id,product_id,variant_id,movement_type,quantity_delta,quantity_before,quantity_after,reason,reference_type,reference_id,actor_id,created_at) VALUES ${saleMoves.slice(i, i + 150).map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",")}`, saleMoves.slice(i, i + 150).flat());
  }
  for (const [cid, t] of customerTotals) await run("UPDATE customers SET total_spend=?, visits=?, last_visit_at=? WHERE id=?", [money(t.spend), t.visits, t.last, cid]);
  await run("UPDATE pos_terminals SET receipt_seq = GREATEST(receipt_seq, ?) WHERE id=?", [SALES, terminal.id]);

  console.log(`Seeded ${SALES} sales, ${itemRows.length} line items, ${customerRows.length} customers in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
  await pool.end();
}

main().catch(async (e) => { console.error("Seed failed:", e); await pool.end(); process.exit(1); });
