/**
 * Seeds realistic, clearly-labelled demo data into the LIVE database.
 * - Products use SKU prefix `SEED-` and names starting `Seed ·` with precise
 *   brand / model / size names, brief descriptions and proper units (L, ml, job…).
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

const CATEGORY_NAMES = [
  "Phones & Tablets", "Laptops", "Printers & Ink", "Accessories", "Stationery",
  "Design Services", "Networking", "Power & Cables", "Beverages & Water", "Home & Cleaning",
];

/** A template generates 8 precisely-named products from its variant suffixes. */
type Template = { cat: string; name: string; desc: string; unit: string; variants: string[]; base: number; step: number };
const TEMPLATES: Template[] = [
  // Phones & Tablets
  { cat: "Phones & Tablets", name: "Samsung Galaxy A15", desc: "6.5″ Super AMOLED, 50MP triple camera, 5000mAh, dual SIM.", unit: "pc", base: 1250, step: 80, variants: ["4GB/128GB · Blue Black", "4GB/128GB · Blue", "6GB/128GB · Blue Black", "6GB/128GB · Blue", "8GB/256GB · Blue Black", "8GB/256GB · Blue", "4GB/128GB · Yellow", "6GB/256GB · Yellow"] },
  { cat: "Phones & Tablets", name: "Xiaomi Redmi Note 13", desc: "6.67″ AMOLED 120Hz, 108MP camera, 5000mAh with 33W fast charging.", unit: "pc", base: 1400, step: 90, variants: ["8GB/128GB · Midnight Black", "8GB/128GB · Ice Blue", "8GB/256GB · Midnight Black", "8GB/256GB · Ice Blue", "8GB/256GB · Mint Green", "12GB/256GB · Midnight Black", "12GB/256GB · Ice Blue", "12GB/256GB · Mint Green"] },
  { cat: "Phones & Tablets", name: "Tecno Spark 20 Pro", desc: "6.78″ 120Hz display, 108MP main camera, 5000mAh battery.", unit: "pc", base: 900, step: 60, variants: ["8GB/128GB · Magnet Black", "8GB/128GB · Caribbean Blue", "8GB/256GB · Magnet Black", "8GB/256GB · Caribbean Blue", "8GB/256GB · Moonlit White", "8GB/256GB · Obsidian Grey", "12GB/256GB · Magnet Black", "12GB/256GB · Caribbean Blue"] },
  { cat: "Phones & Tablets", name: "Apple iPad 10th Gen", desc: "10.9″ Liquid Retina display, A14 Bionic, Wi-Fi and USB-C.", unit: "pc", base: 3200, step: 220, variants: ["64GB · Silver", "64GB · Blue", "64GB · Pink", "64GB · Yellow", "256GB · Silver", "256GB · Blue", "256GB · Pink", "256GB · Yellow"] },

  // Laptops
  { cat: "Laptops", name: "HP Pavilion 14", desc: "14″ Full HD, Intel Core i5/i7, 8–32GB RAM, SSD.", unit: "pc", base: 4200, step: 250, variants: ["i5 · 8GB/512GB · Silver", "i5 · 16GB/512GB · Silver", "i5 · 16GB/1TB · Gold", "i7 · 16GB/512GB · Silver", "i7 · 16GB/1TB · Gold", "i7 · 32GB/1TB · Silver", "i5 · 8GB/256GB · Gold", "i7 · 16GB/512GB · Gold"] },
  { cat: "Laptops", name: "Lenovo IdeaPad Slim 3", desc: "15.6″ Full HD, AMD Ryzen 5/7, SSD, slim design.", unit: "pc", base: 3500, step: 200, variants: ["Ryzen 5 · 8GB/256GB · Grey", "Ryzen 5 · 8GB/512GB · Grey", "Ryzen 5 · 16GB/512GB · Blue", "Ryzen 5 · 16GB/1TB · Grey", "Ryzen 7 · 16GB/512GB · Blue", "Ryzen 7 · 16GB/1TB · Grey", "Ryzen 7 · 32GB/1TB · Blue", "Ryzen 5 · 16GB/512GB · Grey"] },
  { cat: "Laptops", name: "Dell Inspiron 14", desc: "14″ Full HD, Intel Core i5/i7, up to 32GB RAM.", unit: "pc", base: 4600, step: 260, variants: ["i5 · 8GB/512GB · Silver", "i5 · 16GB/512GB · Silver", "i5 · 16GB/1TB · Silver", "i7 · 16GB/512GB · Silver", "i7 · 16GB/1TB · Silver", "i7 · 32GB/1TB · Silver", "i5 · 8GB/256GB · Silver", "i7 · 16GB/512GB · Black"] },
  { cat: "Laptops", name: "Apple MacBook Air M2", desc: "13.6″ Liquid Retina, Apple M2 chip, fanless all-day battery.", unit: "pc", base: 7500, step: 400, variants: ["8GB/256GB · Midnight", "8GB/256GB · Starlight", "8GB/512GB · Midnight", "8GB/512GB · Starlight", "16GB/256GB · Space Grey", "16GB/512GB · Space Grey", "16GB/512GB · Midnight", "24GB/512GB · Starlight"] },

  // Printers & Ink
  { cat: "Printers & Ink", name: "HP DeskJet 2720", desc: "All-in-one colour inkjet: print, scan and copy with Wi-Fi.", unit: "pc", base: 850, step: 60, variants: ["Printer only", "+ 2 ink cartridges", "+ 500 A4 sheets", "+ USB cable", "+ Wi-Fi setup", "+ 3-year care pack", "+ 20 photo sheets", "+ ink & paper bundle"] },
  { cat: "Printers & Ink", name: "Epson EcoTank L3250", desc: "Refillable ink-tank all-in-one, Wi-Fi, up to 4500 black pages.", unit: "pc", base: 2200, step: 120, variants: ["Printer only", "+ ink bottle set", "+ 500 A4 sheets", "+ Wi-Fi setup", "+ 2-year warranty", "+ photo paper", "+ ink & paper bundle", "+ care pack"] },
  { cat: "Printers & Ink", name: "Canon PIXMA G3411", desc: "Refillable ink-tank printer with scan and copy functions.", unit: "pc", base: 1900, step: 110, variants: ["Printer only", "+ ink bottle set", "+ 500 A4 sheets", "+ photo paper", "+ Wi-Fi setup", "+ 2-year warranty", "+ ink & paper bundle", "+ care pack"] },
  { cat: "Printers & Ink", name: "HP LaserJet Pro M15w", desc: "Compact mono laser printer with Wi-Fi and mobile printing.", unit: "pc", base: 1600, step: 100, variants: ["Printer only", "+ toner cartridge", "+ 500 A4 sheets", "+ USB cable", "+ Wi-Fi setup", "+ 3-year care pack", "+ toner & paper bundle", "+ extended warranty"] },

  // Accessories
  { cat: "Accessories", name: "Sony WH-CH720N", desc: "Wireless noise-cancelling headphones, up to 35 hours playback.", unit: "pc", base: 550, step: 35, variants: ["Black", "White", "Blue", "Grey", "Black + case", "White + case", "Blue + case", "Grey + case"] },
  { cat: "Accessories", name: "Logitech MX Master 3S", desc: "Ergonomic wireless mouse, 8K DPI sensor, quiet clicks.", unit: "pc", base: 650, step: 40, variants: ["Graphite", "Pale Grey", "Graphite + USB-C cable", "Pale Grey + USB-C cable", "Graphite + wrist rest", "Pale Grey + wrist rest", "Graphite + mouse pad", "Pale Grey + mouse pad"] },
  { cat: "Accessories", name: "JBL Flip 6", desc: "Portable Bluetooth speaker, IP67 waterproof, 12-hour playtime.", unit: "pc", base: 700, step: 45, variants: ["Black", "Blue", "Red", "Teal", "Black + case", "Blue + case", "Red + case", "Teal + case"] },
  { cat: "Accessories", name: "SanDisk Ultra microSD", desc: "Class 10 microSD card with adapter, up to 140MB/s.", unit: "pc", base: 90, step: 25, variants: ["32GB", "64GB", "128GB", "256GB", "512GB", "64GB · 2-pack", "128GB · 2-pack", "256GB · 2-pack"] },

  // Stationery
  { cat: "Stationery", name: "Moleskine Classic Notebook", desc: "A5 hard-cover notebook, 192 pages of 90gsm paper.", unit: "pc", base: 120, step: 12, variants: ["A5 · Black · Ruled", "A5 · Navy · Ruled", "A5 · Black · Dotted", "A5 · Navy · Dotted", "A5 · Black · Plain", "A5 · Navy · Plain", "A6 · Black · Ruled", "A6 · Navy · Ruled"] },
  { cat: "Stationery", name: "Bic Intensity Ballpoint Pen", desc: "Smooth-writing retractable ballpoint pen.", unit: "pc", base: 15, step: 2, variants: ["Black · 1.0mm", "Blue · 1.0mm", "Red · 1.0mm", "Black · 0.7mm", "Blue · 0.7mm", "Red · 0.7mm", "Black · 12-pack", "Blue · 12-pack"] },
  { cat: "Stationery", name: "Avery A4 Document File", desc: "Clear A4 sheet protector for documents and presentations.", unit: "box", base: 35, step: 4, variants: ["Clear · 10-pack", "Blue · 10-pack", "Red · 10-pack", "Green · 10-pack", "Clear · 50-pack", "Blue · 50-pack", "Red · 50-pack", "Green · 50-pack"] },
  { cat: "Stationery", name: "Stanley Stapler", desc: "Desktop stapler with jam-free mechanism and metal base.", unit: "pc", base: 95, step: 10, variants: ["Black · 25-sheet", "Grey · 25-sheet", "Blue · 25-sheet", "Black · 40-sheet", "Grey · 40-sheet", "Blue · 40-sheet", "Black + staples", "Grey + staples"] },

  // Design Services
  { cat: "Design Services", name: "Logo Design Package", desc: "Original logo concepts with revisions and final SVG/PNG files.", unit: "job", base: 350, step: 60, variants: ["Starter · 1 concept", "Standard · 3 concepts", "Premium · 5 concepts", "Express · 24h", "Business bundle", "Social media kit", "Brand basics", "Full identity"] },
  { cat: "Design Services", name: "Flyer Design", desc: "Print-ready promotional flyer design in your brand colours.", unit: "job", base: 150, step: 25, variants: ["A5 · 1 side", "A5 · 2 sides", "A4 · 1 side", "A4 · 2 sides", "A3 · 1 side", "DL · 1 side", "A5 + 500 prints", "A4 + 500 prints"] },
  { cat: "Design Services", name: "Business Card Design", desc: "Professional double-sided business card layout and print file.", unit: "job", base: 180, step: 20, variants: ["Single sided", "Double sided", "Matt finish", "Gloss finish", "100 cards", "250 cards", "500 cards", "1000 cards"] },
  { cat: "Design Services", name: "Photo Retouching", desc: "Colour correction, cleanup and smoothing for photos.", unit: "job", base: 40, step: 15, variants: ["1 image", "5 images", "10 images", "20 images", "Portrait · 5 images", "Product · 10 images", "Wedding · 50 images", "Express · 1 image"] },

  // Networking
  { cat: "Networking", name: "TP-Link Archer C6", desc: "AC1200 dual-band Wi-Fi router with 4 Gigabit ports.", unit: "pc", base: 420, step: 30, variants: ["Router only", "+ Ethernet cable", "+ 2-year warranty", "+ installation", "+ mesh node", "+ 20m CAT6 cable", "+ router + cable bundle", "+ care pack"] },
  { cat: "Networking", name: "Netgear GS308", desc: "8-port Gigabit unmanaged switch, plug-and-play.", unit: "pc", base: 350, step: 35, variants: ["8-port switch", "8-port + cables", "8-port + rack mount", "16-port switch", "16-port + cables", "24-port switch", "24-port + rack mount", "8-port + 2-year care"] },
  { cat: "Networking", name: "CAT6 Ethernet Cable", desc: "High-speed CAT6 network patch cable, snagless connectors.", unit: "pc", base: 15, step: 4, variants: ["1 m", "2 m", "3 m", "5 m", "10 m", "15 m", "20 m", "30 m"] },
  { cat: "Networking", name: "Ubiquiti UniFi AP AC Lite", desc: "Ceiling Wi-Fi access point with PoE and central management.", unit: "pc", base: 750, step: 60, variants: ["Access point only", "+ PoE injector", "+ mounting kit", "+ 2-year care", "+ PoE + mount", "+ 5-pack", "+ 10-pack", "+ 3-year care"] },

  // Power & Cables
  { cat: "Power & Cables", name: "Anker PowerCore 20000", desc: "20000mAh portable power bank with 22.5W fast charging.", unit: "pc", base: 350, step: 25, variants: ["Black · 20000mAh", "White · 20000mAh", "Black · 10000mAh", "White · 10000mAh", "Black · 20000mAh + cable", "White · 20000mAh + cable", "Black · 26800mAh", "White · 26800mAh"] },
  { cat: "Power & Cables", name: "UGREEN USB-C Cable", desc: "Braided USB-C to USB-C cable with 60W/100W power delivery.", unit: "pc", base: 45, step: 8, variants: ["1 m · 60W", "2 m · 60W", "3 m · 60W", "1 m · 100W", "2 m · 100W", "3 m · 100W", "1 m · 2-pack", "2 m · 2-pack"] },
  { cat: "Power & Cables", name: "Belkin BoostCharge Wall Charger", desc: "Compact USB-C wall charger with Power Delivery.", unit: "pc", base: 120, step: 15, variants: ["20W · Black", "20W · White", "30W · Black", "30W · White", "65W · Black", "65W · White", "20W · 2-pack", "30W · 2-pack"] },
  { cat: "Power & Cables", name: "AmazonBasics HDMI Cable", desc: "High-speed HDMI cable for TVs, monitors and consoles.", unit: "pc", base: 35, step: 6, variants: ["1 m", "2 m", "3 m", "5 m", "10 m", "15 m", "2 m · 2-pack", "5 m · 2-pack"] },

  // Beverages & Water - volumes in L / ml
  { cat: "Beverages & Water", name: "Nestlé Pure Life Still Water", desc: "Purified still water in recyclable PET bottles.", unit: "L", base: 6, step: 2, variants: ["500 ml", "1 L", "1.5 L", "2 L", "500 ml · 6-pack", "1 L · 12-pack", "1.5 L · 6-pack", "2 L · 6-pack"] },
  { cat: "Beverages & Water", name: "Coca-Cola Original Taste", desc: "Classic carbonated soft drink, chilled and ready to serve.", unit: "ml", base: 8, step: 2, variants: ["330 ml can", "500 ml bottle", "1 L bottle", "1.5 L bottle", "2 L bottle", "330 ml · 6-pack", "500 ml · 6-pack", "1.5 L · 4-pack"] },
  { cat: "Beverages & Water", name: "Tropicana Orange Juice", desc: "100% orange juice with no added sugar.", unit: "L", base: 12, step: 3, variants: ["200 ml", "500 ml", "1 L", "1.5 L", "200 ml · 6-pack", "500 ml · 4-pack", "1 L · 2-pack", "1.5 L · 2-pack"] },
  { cat: "Beverages & Water", name: "Red Bull Energy Drink", desc: "Energy drink with caffeine, taurine and B vitamins.", unit: "ml", base: 15, step: 3, variants: ["250 ml", "355 ml", "473 ml", "250 ml · 4-pack", "250 ml · 12-pack", "355 ml · 4-pack", "473 ml · 4-pack", "250 ml · 24-pack"] },

  // Home & Cleaning - volumes in L / ml
  { cat: "Home & Cleaning", name: "Golden Sun Cooking Oil", desc: "Refined vegetable oil for everyday cooking and frying.", unit: "L", base: 35, step: 12, variants: ["500 ml", "1 L", "2 L", "3 L", "5 L", "1 L · 2-pack", "2 L · 2-pack", "5 L · 4-pack"] },
  { cat: "Home & Cleaning", name: "Dettol Antiseptic Liquid", desc: "Disinfectant liquid for household cleaning and personal care.", unit: "ml", base: 25, step: 8, variants: ["250 ml", "500 ml", "1 L", "2 L", "250 ml · 2-pack", "500 ml · 2-pack", "1 L · 2-pack", "2 L · 4-pack"] },
  { cat: "Home & Cleaning", name: "Omo Multi Action Detergent", desc: "Liquid laundry detergent for coloured and white clothes.", unit: "L", base: 30, step: 10, variants: ["500 ml", "1 L", "2 L", "3 L", "1 L refill", "2 L refill", "3 L refill", "5 L"] },
  { cat: "Home & Cleaning", name: "Harpic Toilet Cleaner", desc: "Toilet bowl cleaner with disinfectant and fresh fragrance.", unit: "ml", base: 20, step: 6, variants: ["500 ml", "1 L", "2 L", "500 ml · 2-pack", "1 L · 2-pack", "2 L · 2-pack", "500 ml · 4-pack", "1 L · 4-pack"] },
];

const IMAGES: Record<string, string> = {
  "Phones & Tablets": "1511707171634-5f897ff02aa9",
  "Laptops": "1496181133206-80ce9b88a853",
  "Printers & Ink": "1612815154858-60aa4c59eaa6",
  "Accessories": "1505740420928-5e560c06d30e",
  "Stationery": "1455390582262-044cdead277a",
  "Design Services": "1626785774573-4b799315345d",
  "Networking": "1544197150-b99a580bb7a8",
  "Power & Cables": "1583394838336-acd977736f90",
  "Beverages & Water": "1548831935-8a80f4ea87e9",
  "Home & Cleaning": "1602143407151-7111542de6e8",
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
  if (!org || !branch || !terminal || !cashier) throw new Error("Business, branch, till or owner missing - finish onboarding first.");

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

  type Product = { id: string; name: string; sku: string; barcode: string; image: string; cost: number; price: number; cat: string; stock: number; unit: string; brand: string; description: string };
  const products: Product[] = [];
  const invRows: unknown[][] = [];
  const movementRows: unknown[][] = [];
  const now = stamp(new Date());

  outer: for (const t of TEMPLATES) {
    for (let v = 0; v < t.variants.length; v++) {
      if (products.length >= PRODUCTS) break outer;
      const variant = t.variants[v]!;
      // Volume products use L / ml as their unit; everything else keeps the template's unit.
      const unit = /\bml\b/i.test(variant) ? "ml" : /(?:^|\s)\d+(?:\.\d+)?\s*L\b/.test(variant) ? "L" : t.unit;
      const price = money(t.base + t.step * v + between(0, 3));
      const cost = money(price * (0.62 + rnd() * 0.1));
      const stock = between(18, 120);
      const product: Product = {
        id: randomUUID(), name: `Seed · ${t.name} ${variant}`, sku: `SEED-${String(products.length + 1).padStart(4, "0")}`,
        barcode: `690${String(products.length + 1).padStart(10, "0")}`, image: cover(t.cat), cost, price, cat: t.cat, stock,
        unit, brand: t.name.split(" ")[0]!, description: t.desc,
      };
      products.push(product);
      invRows.push([randomUUID(), org, branch.id, product.id, "", stock, now]);
      movementRows.push([randomUUID(), org, branch.id, product.id, null, "opening", stock, 0, stock, "Seed opening stock", "seed", null, cashier, now]);
    }
  }
  for (let i = 0; i < products.length; i += 100) {
    const chunk = products.slice(i, i + 100);
    await run(`INSERT INTO products (id,organization_id,category_id,name,brand,description,image_url,sku,barcode,cost_price,selling_price,unit,taxable,reorder_level,status,created_at,updated_at) VALUES ${chunk.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",")}`,
      chunk.flatMap((p) => [p.id, org, catMap.get(p.cat), p.name, p.brand, p.description, p.image, p.sku, p.barcode, p.cost, p.price, p.unit, 1, 8, "active", now, now]));
  }
  for (let i = 0; i < invRows.length; i += 100) {
    await run(`INSERT INTO inventory (id,organization_id,branch_id,product_id,variant_key,quantity,updated_at) VALUES ${invRows.slice(i, i + 100).map(() => "(?,?,?,?,?,?,?)").join(",")}`, invRows.slice(i, i + 100).flat());
  }
  for (let i = 0; i < movementRows.length; i += 100) {
    await run(`INSERT INTO stock_movements (id,organization_id,branch_id,product_id,variant_id,movement_type,quantity_delta,quantity_before,quantity_after,reason,reference_type,reference_id,actor_id,created_at) VALUES ${movementRows.slice(i, i + 100).map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",")}`, movementRows.slice(i, i + 100).flat());
  }
  console.log(`Seeded ${products.length} products (${new Set(products.map((p) => p.unit)).size} units: ${[...new Set(products.map((p) => p.unit))].sort().join(", ")}).`);

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
    for (let j = 0; j < lineCount; j++) {
      const p = pick(products);
      const qty = between(1, 4);
      const total = money(p.price * qty);
      subtotal += total;
      cost += money(p.cost * qty);
      tax += money(total * 0.03);
      itemRows.push([randomUUID(), org, saleId, p.id, null, p.name, p.sku, qty, p.price, p.cost, 0, money(total * 0.03), total, 0]);
      saleMoves.push([randomUUID(), org, branch.id, p.id, null, "sale", -qty, null, null, "Seed sale", "sale", saleId, cashier, createdAt]);
    }
    const taxTotal = money(tax);
    const total = money(subtotal + taxTotal);
    const method = pick(METHODS);
    saleRows.push([saleId, org, branch.id, terminal.id, shift ?? null, cashier, customer?.id ?? null, receipt, `seed-${i + 1}`, "completed",
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
