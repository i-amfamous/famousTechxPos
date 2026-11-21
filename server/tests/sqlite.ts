/** Test-only adapter: runs the server's portable SQL on node:sqlite (in memory). */
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import type { Db, Param, Row } from "../src/core/db.js";
import { splitSql } from "../scripts/sql.js";
import { seedReferenceData } from "../src/auth/permission-catalogue.js";

const fix = (sql: string) => sql.replace(/\s+FOR UPDATE\b/gi, "");
const conv = (ps: Param[] = []) => ps.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p));

export async function createSqliteDb(): Promise<Db> {
  const raw = new DatabaseSync(":memory:");
  let depth = 0;
  const db: Db = {
    async all(sql, params) { return raw.prepare(fix(sql)).all(...(conv(params) as never[])) as Row[]; },
    async run(sql, params) { return Number(raw.prepare(fix(sql)).run(...(conv(params) as never[])).changes); },
    async tx(fn) {
      if (depth > 0) return fn(db);
      depth++;
      raw.exec("BEGIN");
      try { const out = await fn(db); raw.exec("COMMIT"); return out; }
      catch (e) { raw.exec("ROLLBACK"); throw e; }
      finally { depth--; }
    },
    async close() { raw.close(); },
  };
  for (const s of splitSql(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"))) raw.exec(s);
  await seedReferenceData(db);
  return db;
}
