/** Environment configuration (see .env.example). */
const env = process.env;

export const config = {
  port: Number(env.PORT ?? 8080),
  databaseUrl: env.DATABASE_URL ?? "",
  databaseSsl: (env.DATABASE_SSL ?? "true") !== "false",
  /** Public URL of the web app — used in invite / reset links and for CORS. Required in production. */
  appUrl: (env.APP_URL ?? (env.NODE_ENV === "production" ? "" : "http://localhost:5173")).replace(/\/$/, ""),
  /** Extra allowed origins for CORS, comma separated (e.g. a LAN address for phones). */
  corsOrigins: (env.CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  smtp: {
    host: env.SMTP_HOST ?? "",
    port: Number(env.SMTP_PORT ?? 587),
    user: env.SMTP_USER ?? "",
    pass: env.SMTP_PASS ?? "",
    from: env.MAIL_FROM ?? env.SMTP_USER ?? "",
  },
  /** Brevo REST API key (xkeysib-…). Preferred over SMTP: one credential, no relay port/IP issues. */
  brevoApiKey: env.BREVO_API_KEY ?? "",
  upcItemDbKey: env.UPCITEMDB_KEY ?? "",
  /** Set to "false" to disable online barcode lookups. */
  barcodeOnline: (env.BARCODE_ONLINE ?? "true") !== "false",
};
