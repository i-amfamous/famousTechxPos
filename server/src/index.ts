/** Server entry point. */
import { createServer } from "node:http";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { createMysqlDb } from "./core/db.js";
import { mailConfigured, mailDiagnostics } from "./core/mail.js";
import { attachScanRelay, isScanPath } from "./realtime/scan-relay.js";
import { attachChangeRelay, isChangeUpgrade } from "./realtime/change-relay.js";

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
  const changes = attachChangeRelay(server, db);
  // Both relays ignore upgrades they do not own. Close anything else that looks
  // like a WS route so stale sockets never hang after a redeploy.
  server.on("upgrade", (req, socket) => {
    const url = new URL(req.url ?? "/", "http://x");
    const wsRoute = /^(\/api)?\/ws\//.test(url.pathname);
    if (wsRoute && !isScanPath(url) && !isChangeUpgrade(url)) socket.destroy();
  });
  server.listen(config.port, () => {
    console.log(`Famous TechX POS API listening on :${config.port}`);
    console.log(`  web app: ${config.appUrl}   email: ${mailConfigured() ? `${mailDiagnostics().transport} ready` : "not configured (invite links are shown in the app)"}`);
  });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    relay.close(); // end scanner sessions before the process exits
    changes.close();
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
