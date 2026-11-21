/**
 * Runs the API on a throw-away in-memory database — no TiDB, no .env needed. Great for trying the app
 * or developing the website. Everything is lost when you stop it.
 *   npm run dev:memory      →  http://localhost:8080
 * Emails (invites, password resets) are printed here instead of being sent.
 *
 * Uses the same routes and services as production; only the database driver differs.
 */
import { createServer } from "node:http";
import { AppError } from "../src/core/errors.js";
import { captureMail, outbox } from "../src/core/mail.js";
import { dispatch } from "../src/http/router.js";
import { router } from "../src/http/routes.js";
import { attachScanRelay } from "../src/realtime/scan-relay.js";
import { createSqliteDb } from "../tests/sqlite.js";

const PORT = Number(process.env.PORT ?? 8080);
const db = await createSqliteDb();
captureMail(true);

const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Terminal-Token");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return void res.end();

  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  };
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/health") return send(200, { ok: true, db: "memory" });
  const match = router.match(req.method ?? "GET", url.pathname.replace(/^\/api(?=\/)/, ""));
  if (!match) return send(404, { error: "not_found", message: "Not found." });

  let raw = "";
  for await (const chunk of req) raw += chunk;
  const auth = req.headers.authorization;
  const sentBefore = outbox.length;
  try {
    const out = await dispatch(match.route, {
      db, body: raw ? JSON.parse(raw) : {}, params: match.params, query: Object.fromEntries(url.searchParams),
      token: auth?.startsWith("Bearer ") ? auth.slice(7) : undefined,
      terminalToken: req.headers["x-terminal-token"] as string | undefined,
      userAgent: req.headers["user-agent"],
    }, req.socket.remoteAddress ?? "local");
    send(200, out);
  } catch (e) {
    if (e instanceof AppError) send(e.status, { error: e.code, message: e.message, ...e.extra });
    else { console.error(e); send(500, { error: "server_error", message: "Something went wrong on the server." }); }
  } finally {
    for (const mail of outbox.slice(sentBefore)) console.log(`\n✉  To: ${mail.to}\n   ${mail.subject}\n${mail.text.replace(/^/gm, "   ")}\n`);
  }
});

attachScanRelay(server);
server.listen(PORT, () => console.log(`Famous TechX API (in-memory database) on http://localhost:${PORT}`));
