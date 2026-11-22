/** Paystack endpoints: one signed public webhook and one signed-in way to open Inline. */
import type { Route } from "../../http/router.js";
import { requirePerm } from "../../auth/access.js";
import { initializePaystackInline } from "./paystack.service.js";
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
  {
    method: "post",
    path: "/paystack/initialize",
    auth: "member",
    limit: 20,
    run: (c) => {
      requirePerm(c.actor, "pos.sell");
      return initializePaystackInline({ amount: Number(c.body?.amount), email: c.body?.email, phone: c.body?.phone });
    },
  },
];
