import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import path from "node:path";

// Where the API server runs during development (see server/README.md).
const API_TARGET = process.env.API_TARGET ?? "http://localhost:8080";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiUrl = process.env.VITE_API_URL ?? env.VITE_API_URL;

  // VITE_API_URL is baked into the bundle at build time. Refuse to ship a "live" build
  // that silently runs on sample data. ALLOW_DEMO_BUILD=1 is for an intentional demo bundle.
  if (command === "build" && mode === "production" && !apiUrl && process.env.ALLOW_DEMO_BUILD !== "1") {
    throw new Error(
      "VITE_API_URL is required for a production build — copy .env.production.example to .env.production and set the API URL. " +
      "Set ALLOW_DEMO_BUILD=1 only if you intentionally want a demo-data bundle.",
    );
  }
  if (command === "build" && mode === "production" && apiUrl === "/api") {
    console.warn("[config] VITE_API_URL=/api requires a reverse proxy for /api and /ws in production; use the full API origin instead.");
  }

  const proxy = { "/api": { target: API_TARGET, changeOrigin: true, ws: true } };

  return {
    // `npm run dev:https` serves over HTTPS on your network so phones can use their camera as a scanner
    // (browsers only allow camera access on HTTPS or localhost).
    plugins: [react(), tailwindcss(), ...(process.env.HTTPS ? [basicSsl()] : [])],
    resolve: { alias: { "@": path.resolve(__dirname, "src") } },
    server: {
      // With VITE_API_URL=/api the website and the API share one address, so a phone on the same
      // Wi-Fi reaches both through this dev server (the API accepts the /api prefix).
      proxy,
    },
    // `npm run preview` serves a production bundle locally with the same API proxy.
    preview: { proxy },
  };
});
