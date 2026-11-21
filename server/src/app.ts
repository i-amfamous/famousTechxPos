/** Express app: CORS, JSON, the route table, error handling. */
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { config } from "./config.js";
import type { Db } from "./core/db.js";
import { AppError } from "./core/errors.js";
import { dispatch } from "./http/router.js";
import { router } from "./http/routes.js";

export function createApp(db: Db) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // Render / Railway sit behind a proxy

  const allowed = new Set([config.appUrl, ...config.corsOrigins]);
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || allowed.has(origin) || config.corsOrigins.includes("*") || /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin)),
    allowedHeaders: ["Content-Type", "Authorization", "X-Terminal-Token"],
    maxAge: 86400,
  }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", async (_req, res) => {
    try { await db.all("SELECT 1 AS ok"); res.json({ ok: true, db: "up" }); }
    catch (e) {
      console.error("[health] database check failed:", e);
      res.status(503).json({ ok: false, db: "down", error: (e as { code?: string })?.code ?? "unknown" });
    }
  });

  app.use(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const path = req.path.replace(/^\/api(?=\/)/, ""); // works mounted at / or /api
      const m = router.match(req.method, path);
      if (!m) return next();
      const auth = req.header("authorization");
      const out = await dispatch(m.route, {
        db, body: req.body, params: m.params, query: req.query as Record<string, string>,
        token: auth?.startsWith("Bearer ") ? auth.slice(7).trim() : undefined,
        terminalToken: req.header("x-terminal-token") ?? undefined,
        userAgent: req.header("user-agent") ?? undefined,
      }, req.ip ?? "unknown");
      res.setHeader("Cache-Control", "no-store");
      res.json(out);
    } catch (e) { next(e); }
  });

  app.use((_req: Request, res: Response) => res.status(404).json({ error: "not_found", message: "Not found." }));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) return res.status(err.status).json({ error: err.code, message: err.message, ...err.extra });
    if ((err as { type?: string })?.type === "entity.parse.failed") return res.status(400).json({ error: "bad_json", message: "Invalid request." });
    console.error(err);
    res.status(500).json({ error: "server_error", message: "Something went wrong on the server. Please try again." });
  });
  return app;
}
