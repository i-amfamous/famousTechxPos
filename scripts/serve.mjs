/**
 * Tiny static server for the built React app. Used by `npm start` when the site is
 * hosted as a Node Web Service (a Render Static Site does not need this).
 * Serves dist/ with an SPA fallback so deep links like /pos work on refresh.
 */
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = resolve(process.cwd(), "dist");
const port = Number(process.env.PORT || 8080);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  } catch {
    res.writeHead(400).end("Bad request");
    return;
  }

  const file = resolve(root, `.${normalize(pathname)}`);
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  const target = existsSync(file) && statSync(file).isFile() ? file : join(root, "index.html");
  if (!existsSync(target)) {
    res.writeHead(404).end("Not found");
    return;
  }

  const hashedAsset = pathname.startsWith("/assets/") && target !== join(root, "index.html");
  res.writeHead(200, {
    "Content-Type": types[extname(target).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": hashedAsset ? "public, max-age=31536000, immutable" : "no-cache",
  });

  if (req.method === "HEAD") { res.end(); return; }
  const stream = createReadStream(target);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}).listen(port, "0.0.0.0", () => {
  console.log(`Website serving ${root} on http://0.0.0.0:${port}`);
});
