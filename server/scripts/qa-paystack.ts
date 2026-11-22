/** Temporary live check: a MoMo checkout must create a Paystack request, then clean up. */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";

const API = "https://famoustechxpos-1.onrender.com";
const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const line = env.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
const url = line!.slice("DATABASE_URL=".length).trim().replace(/\/sys(\?|$)/, "/famous_pos$1");
const db = await mysql.createConnection({ uri: url, ssl: { rejectUnauthorized: false } });
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const now = () => new Date().toISOString().slice(0, 23).replace("T", " ");
const plusHours = (h: number) => new Date(Date.now() + h * 3600000).toISOString().slice(0, 23).replace("T", " ");

const [owners] = await db.query("SELECT id,user_id,organization_id FROM business_members WHERE is_owner=1 ORDER BY created_at LIMIT 1");
const owner = (owners as { id: string; user_id: string; organization_id: string }[])[0]!;
const [terminals] = await db.query("SELECT terminal_id FROM shifts WHERE organization_id=? AND status='open' LIMIT 1", [owner.organization_id]);
const terminalId = (terminals as { terminal_id: string }[])[0]?.terminal_id;
const [products] = await db.query("SELECT id,selling_price FROM products WHERE sku LIKE 'SEED-%' AND status='active' ORDER BY sku LIMIT 1");
const product = (products as { id: string; selling_price: string }[])[0]!;
if (!terminalId) throw new Error("No open shift found for QA checkout");
const [biz] = await db.query("SELECT settings FROM businesses WHERE id=?", [owner.organization_id]);
const settings = { tax_rate: 0, prices_include_tax: true, ...JSON.parse(((biz as { settings: string }[])[0]?.settings ?? "{}")) };
const rate = Number(settings.tax_rate ?? 0);
const price = Number(product.selling_price);
const total = settings.prices_include_tax !== false ? price : Math.round(price * (1 + rate / 100) * 100) / 100;

const token = randomBytes(32).toString("hex");
await db.query("INSERT INTO sessions (id,token_hash,user_id,organization_id,member_id,method,created_at,last_seen_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)",
  [randomUUID(), sha(token), owner.user_id, owner.organization_id, owner.id, "password", now(), now(), plusHours(2)]);

let saleId = "";
try {
  const r = await fetch(`${API}/api/checkout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      terminalId,
      idempotencyKey: `qa-paystack-${Date.now()}`,
      lines: [{ productId: product.id, quantity: 1 }],
      payments: [{ method: "momo", amount: total, phone: "0240000000", network: "MTN" }],
    }),
    signal: AbortSignal.timeout(40000),
  });
  const body = await r.json() as Record<string, any>;
  saleId = String(body.saleId ?? body.sale?.id ?? "");
  console.log(`checkout status=${r.status} saleId=${saleId || "none"}`);
  if (!saleId) { console.log(JSON.stringify(body).slice(0, 500)); process.exitCode = 1; }
  else {
    const [rows] = await db.query("SELECT provider,status,provider_reference,message FROM momo_requests WHERE sale_id=?", [saleId]);
    const req = (rows as { provider: string; status: string; provider_reference: string; message: string }[])[0];
    console.log("momo request:", JSON.stringify(req));
    if (req?.provider !== "paystack") process.exitCode = 1;
  }
} finally {
  if (saleId) {
    await db.query("DELETE FROM momo_requests WHERE sale_id=?", [saleId]);
    await db.query("DELETE FROM payments WHERE sale_id=?", [saleId]);
    await db.query("DELETE FROM sale_items WHERE sale_id=?", [saleId]);
    await db.query("DELETE FROM stock_movements WHERE reference_type='sale' AND reference_id=?", [saleId]);
    await db.query("DELETE FROM sales WHERE id=?", [saleId]);
    await db.query("DELETE FROM activity_log WHERE entity_id=?", [saleId]).catch(() => undefined);
    console.log(`cleaned QA sale ${saleId}`);
  }
  await db.query("UPDATE sessions SET revoked_at=? WHERE token_hash=?", [now(), sha(token)]);
  await db.end();
}
