/** Server entry point. */
import { createServer } from "node:http";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { createMysqlDb } from "./core/db.js";
import { mailConfigured } from "./core/mail.js";
import { attachScanRelay } from "./realtime/scan-relay.js";

async function main() {
  if (!config.databaseUrl) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
    process.exit(1);
  }
  if (!config.appUrl) {
    console.error("APP_URL is required in production (public address of the web app).");
    process.exit(1);
  }
  const db = await createMysqlDb(config.databaseUrl, config.databaseSsl);
  const server = createServer(createApp(db));
  const relay = attachScanRelay(server);
  server.listen(config.port, () => {
    console.log(`Famous TechX POS API listening on :${config.port}`);
    console.log(`  web app: ${config.appUrl}   email: ${mailConfigured() ? "SMTP ready" : "not configured (invite links are shown in the app)"}`);
  });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    relay.close(); // end scanner sessions before the process exits
    server.close(() => { void db.close().finally(() => process.exit(0)); });
    setTimeout(() => {
      console.error("Shutdown timed out with connections still open.");
      process.exit(1);
    }, 10_000).unref();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

void main().catch((e) => { console.error("Failed to start the API:", e); process.exit(1); });
