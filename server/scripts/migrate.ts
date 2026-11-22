/**
 * Creates / updates the database tables. Safe to run again (everything is IF NOT EXISTS).
 *   npm run migrate
 * Also adds the permission catalogue and plans.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createMysqlDb, one } from "../src/core/db.js";
import { config } from "../src/config.js";
import { seedReferenceData } from "../src/auth/permission-catalogue.js";
import { splitSql } from "./sql.js";

async function main() {
  if (!config.databaseUrl) throw new Error("DATABASE_URL is not set (see .env.example).");
  const url = new URL(config.databaseUrl.replace(/^mysql:/, "http:"));
  const dbName = url.pathname.replace(/^\//, "");
  if (dbName) {
    // Create the database first if it doesn't exist yet (TiDB Cloud starts with only `test`).
    const admin = await createMysqlDb(config.databaseUrl.replace(/\/[^/?]+(\?|$)/, "/$1"), config.databaseSsl);
    await admin.run(`CREATE DATABASE IF NOT EXISTS ${dbName.replace(/[^A-Za-z0-9_]/g, "")}`);
    await admin.close();
  }
  const db = await createMysqlDb(config.databaseUrl, config.databaseSsl);
  const sql = readFileSync(resolve(process.cwd(), "db/schema.sql"), "utf8"); // run from the server folder
  const statements = splitSql(sql);
  for (const s of statements) await db.run(s);
  // CREATE TABLE IF NOT EXISTS won't add new columns to an existing database.
  const memberCol = await one(db, "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'auth_tokens' AND COLUMN_NAME = 'member_id'");
  if (!memberCol) await db.run("ALTER TABLE auth_tokens ADD COLUMN member_id CHAR(36) NULL");
  const deletedAtCol = await one(db, "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'business_members' AND COLUMN_NAME = 'deleted_at'");
  if (!deletedAtCol) {
    await db.run("ALTER TABLE business_members ADD COLUMN deleted_at DATETIME(3) NULL");
    await db.run("ALTER TABLE business_members ADD COLUMN deleted_by CHAR(36) NULL");
  }
  // Index must be created after the columns exist (existing DBs get them via the ALTER above).
  await db.run("CREATE INDEX IF NOT EXISTS members_deleted ON business_members (organization_id, deleted_at)");
  await seedReferenceData(db);
  await db.run("DELETE FROM schema_migrations WHERE version = ?", ["2026-11-21"]);
  await db.run("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", ["2026-11-21", new Date().toISOString().slice(0, 23).replace("T", " ")]);
  console.log(`Database ready: ${statements.length} statements applied to "${dbName || "(default)"}".`);
  await db.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
