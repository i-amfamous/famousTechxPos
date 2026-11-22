/** Paystack calls this public endpoint; authenticity is proved by its HMAC signature. */
import type { Route } from "../../http/router.js";
import { handlePaystackWebhook } from "./paystack-webhook.service.js";

export const paystackRoutes: Route[] = [
  {
    method: "post",
    path: "/webhooks/paystack",
    auth: "public",
    run: (c) => handlePaystackWebhook({
      db: c.db,
      body: c.body,
      rawBody: c.rawBody,
      signature: c.headers?.["x-paystack-signature"],
    }),
  },
];
