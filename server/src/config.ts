/** Environment configuration (see .env.example). */
const env = process.env;

export const config = {
  port: Number(env.PORT ?? 8080),
  databaseUrl: env.DATABASE_URL ?? "",
  databaseSsl: (env.DATABASE_SSL ?? "true") !== "false",
  /** Public URL of the web app - used in invite / reset links and for CORS. Required in production. */
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
  /** Paystack Ghana Mobile Money: one account routes MTN MoMo, Telecel Cash and AirtelTigo. */
  paystack: {
    secretKey: env.PAYSTACK_SECRET_KEY ?? "",
    publicKey: env.PAYSTACK_PUBLIC_KEY ?? "",
    callbackUrl: env.PAYSTACK_CALLBACK_URL ?? "",
  },
  /** Set to "false" to disable online barcode lookups. */
  barcodeOnline: (env.BARCODE_ONLINE ?? "true") !== "false",
  /** Mobile money request-to-pay providers. Empty credentials mean "record as pending" instead of failing checkout. */
  momo: {
    callbackUrl: env.MOMO_CALLBACK_URL ?? "",
    mtn: {
      baseUrl: (env.MTN_MOMO_BASE_URL ?? "").replace(/\/$/, ""),
      apiUser: env.MTN_MOMO_API_USER ?? "",
      apiKey: env.MTN_MOMO_API_KEY ?? "",
      subscriptionKey: env.MTN_MOMO_SUBSCRIPTION_KEY ?? "",
      targetEnv: env.MTN_MOMO_TARGET_ENV ?? "sandbox",
    },
    telecel: {
      baseUrl: (env.TELECEL_CASH_BASE_URL ?? "").replace(/\/$/, ""),
      apiKey: env.TELECEL_CASH_API_KEY ?? "",
      merchantId: env.TELECEL_CASH_MERCHANT_ID ?? "",
      path: env.TELECEL_CASH_PATH ?? "/api/v1/request-to-pay",
    },
    at: {
      baseUrl: (env.AT_MONEY_BASE_URL ?? "").replace(/\/$/, ""),
      apiKey: env.AT_MONEY_API_KEY ?? "",
      merchantId: env.AT_MONEY_MERCHANT_ID ?? "",
      path: env.AT_MONEY_PATH ?? "/api/v1/request-to-pay",
    },
  },
};
