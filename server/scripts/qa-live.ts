/**
 * Live smoke/QA pass against the deployed API.
 * Mints a short-lived session for the existing owner, calls every read endpoint plus a
 * real checkout, then cleans up the QA sale and session. No user password is needed.
 *
 * Run: node --import tsx scripts/qa-live.ts
 * Env: QA_API_URL (defaults to the production API).
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";

const API = process.env.QA_API_URL ?? "https://famoustechxpos-1.onrender.com";
const WEB = process.env.QA_WEB_URL ?? "https://famoustechxpos.onrender.com";
const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const dbLine = env.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
if (!dbLine) throw new Error("DATABASE_URL not found in server/.env");
const url = dbLine.slice("DATABASE_URL=".length).trim().replace(/\/sys(\?|$)/, "/famous_pos$1");
const db = await mysql.createConnection({ uri: url, ssl: { rejectUnauthorized: false } });
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const now = () => new Date().toISOString().slice(0, 23).replace("T", " ");
const plusHours = (h: number) => new Date(Date.now() + h * 3600000).toISOString().slice(0, 23).replace("T", " ");

const [owners] = await db.query("SELECT id,user_id,organization_id FROM business_members WHERE is_owner=1 ORDER BY created_at LIMIT 1");
const owner = (owners as { id: string; user_id: string; organization_id: string }[])[0];
const [branches] = await db.query("SELECT id FROM branches WHERE organization_id=? ORDER BY created_at LIMIT 1", [owner.organization_id]);
const branchId = (branches as { id: string }[])[0]!.id;
const [terminals] = await db.query("SELECT id FROM pos_terminals WHERE organization_id=? AND status='active' ORDER BY created_at LIMIT 1", [owner.organization_id]);
const terminalId = (terminals as { id: string }[])[0]!.id;

// /terminal/roster is device-authenticated and we only have stored token hashes, so mint a
// temporary registered till with a token we know. Removed again in the finally block.
const qaTerminalId = randomUUID();
const qaTerminalToken = randomBytes(32).toString("hex");
await db.query(
  "INSERT INTO pos_terminals (id,organization_id,branch_id,name,code,token_hash,status,created_at) VALUES (?,?,?,?,?,?,?,?)",
  [qaTerminalId, owner.organization_id, branchId, "QA Till", "QA", sha(qaTerminalToken), "active", now()],
);

const token = randomBytes(32).toString("hex");
const sessionId = randomUUID();
await db.query(
  "INSERT INTO sessions (id,token_hash,user_id,organization_id,member_id,method,terminal_id,created_at,last_seen_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
  [sessionId, sha(token), owner.user_id, owner.organization_id, owner.id, "password", null, now(), now(), plusHours(2)],
);

let pass = 0, fail = 0;
const results: { name: string; ms: number; status: number; note: string }[] = [];
async function call(name: string, path: string, init: RequestInit = {}, opts: { auth?: boolean; base?: string } = {}) {
  const started = Date.now();
  const url = opts.base ? `${opts.base}${path}` : `${API}/api${path}`;
  try {
    const r = await fetch(url, {
      ...init,
      headers: { ...(opts.auth === false ? {} : { Authorization: `Bearer ${token}` }), "Content-Type": "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(30000),
    });
    const text = await r.text();
    let body: any;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 120); }
    const ms = Date.now() - started;
    const okStatus = r.status >= 200 && r.status < 300;
    const note = okStatus ? (Array.isArray(body) ? `${body.length} rows` : body?.length !== undefined ? `${body.length} rows` : "") : JSON.stringify(body).slice(0, 160);
    results.push({ name, ms, status: r.status, note });
    okStatus ? pass++ : fail++;
    console.log(`${okStatus ? "PASS" : "FAIL"} ${String(r.status).padEnd(3)} ${String(ms).padStart(5)}ms  ${name.padEnd(28)} ${note}`);
    return body;
  } catch (e) {
    const ms = Date.now() - started;
    results.push({ name, ms, status: 0, note: String(e) });
    fail++;
    console.log(`FAIL   0  ${String(ms).padStart(5)}ms  ${name.padEnd(28)} ${e}`);
    return null;
  }
}

try {
  const b = `branchId=${encodeURIComponent(branchId)}`;
  await call("session", "/me");
  await call("branches", "/branches");
  await call("categories", `/categories?${b}`);
  await call("products", `/products?${b}&limit=50`);
  await call("customers", `/customers?${b}`);
  const sales = await call("sales", `/sales?${b}&limit=50`);
  const firstSale = (sales?.sales ?? sales?.items ?? sales?.[0]) as { id?: string } | undefined;
  let firstReceipt: { receiptNumber?: string; shareToken?: string } | null = null;
  if (firstSale?.id) {
    await call("sale detail", `/sales/${firstSale.id}`);
    firstReceipt = await call("sale receipt", `/sales/${firstSale.id}/receipt`);
    await call("sale refunds", `/sales/${firstSale.id}/refunds`);
    if (firstReceipt?.shareToken) {
      const publicView = await call("public receipt", `/receipts/${encodeURIComponent(firstReceipt.shareToken)}`, {}, { auth: false });
      if (publicView?.receiptNumber !== firstReceipt.receiptNumber) {
        fail++;
        console.log("FAIL     -      public receipt did not match the printed receipt number");
      } else {
        pass++;
        console.log("PASS     -      public receipt matches the printed receipt number");
      }
      await call("receipt page", `/receipt/${encodeURIComponent(firstReceipt.shareToken)}`, {}, { auth: false, base: WEB });
    }
  }
  const range = `from=2026-08-01&to=2026-11-30&${b}`;
  await call("report dashboard", `/reports/dashboard?${range}`);
  await call("report pnl", `/reports/pnl?${range}`);
  await call("report employees", `/reports/employees?${range}`);
  await call("stock movements", `/stock/movements?${b}`);
  await call("shifts", `/shifts?${b}`);
  await call("current shift", `/shifts/current?${b}&terminalId=${encodeURIComponent(terminalId)}`);
  await call("terminals", `/terminals?${b}`);
  await call("terminal roster", "/terminal/roster", { headers: { "X-Terminal-Token": qaTerminalToken } });
  await call("employees", "/employees");
  await call("roles", "/roles");
  await call("permissions", "/permissions");
  await call("notifications", "/notifications");
  await call("activity", "/activity");
  await call("held carts", `/held-carts?${b}`);
  await call("expenses", `/expenses?${b}`);
  await call("suppliers", "/suppliers");
  await call("purchase orders", `/purchase-orders?${b}`);
  await call("transfers", `/transfers?${b}`);
  await call("cash movements", `/cash-movements?${b}`);
  await call("sign-ins", "/sign-ins");
  await call("approvers", `/approvers?${b}`);

  const [picks] = await db.query("SELECT id,selling_price FROM products WHERE sku LIKE 'SEED-%' AND status='active' ORDER BY sku LIMIT 3");
  const lines = (picks as { id: string; selling_price: string }[]).map((p) => ({ productId: p.id, quantity: 1 }));
  const key = `qa-${Date.now()}`;
  const sale: any = await call("checkout (3 lines)", "/checkout", {
    method: "POST",
    body: JSON.stringify({ terminalId, idempotencyKey: key, lines, payments: [{ method: "cash", amount: 10000 }] }),
  });
  const saleId = sale?.sale?.id ?? sale?.id;
  if (saleId) {
    await call("checkout retry (idempotent)", "/checkout", {
      method: "POST",
      body: JSON.stringify({ terminalId, idempotencyKey: key, lines, payments: [{ method: "cash", amount: 10000 }] }),
    });
    await call("sale appears in list", `/sales?${b}&limit=5`);
    await db.query("DELETE FROM payments WHERE sale_id=?", [saleId]);
    await db.query("DELETE FROM sale_items WHERE sale_id=?", [saleId]);
    await db.query("DELETE FROM stock_movements WHERE reference_type='sale' AND reference_id=?", [saleId]);
    await db.query("DELETE FROM sales WHERE id=?", [saleId]);
    await db.query("DELETE FROM activity_log WHERE entity_id=?", [saleId]).catch(() => undefined);
    console.log(`Cleaned QA sale ${saleId}`);
  }
} finally {
  await db.query("UPDATE sessions SET revoked_at=? WHERE id=?", [now(), sessionId]);
  await db.query("DELETE FROM pos_terminals WHERE id=?", [qaTerminalId]);
  await db.end();
}

const slow = results.filter((r) => r.ms > 800).sort((a, b) => b.ms - a.ms);
console.log(`\n${pass} passed, ${fail} failed. Slow calls (>800ms): ${slow.map((r) => `${r.name} ${r.ms}ms`).join(", ") || "none"}`);
process.exit(fail ? 1 : 0);
