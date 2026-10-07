/**
 * Validation of webhook payloads, after (and only after) HMAC verification.
 * Each topic reduces its payload to the one thing the pipeline needs: which
 * Shopify resource the event is about. A payload that doesn't have it is
 * "invalid" and is acknowledged without being acted on.
 */
import { z } from "zod";
import { extractBundlePurchases } from "@/lib/analytics/purchase";
import type { WebhookTopic } from "./registry";

export type PayloadCheck = { ok: true; resourceId: string | null } | { ok: false };

const productSchema = z
  .object({ id: z.union([z.number().int().positive(), z.string().regex(/^\d{1,20}$/)]) })
  .loose();
const subscriptionSchema = z
  .object({
    app_subscription: z
      .object({
        admin_graphql_api_id: z.string().regex(/^gid:\/\/shopify\/AppSubscription\/\d{1,20}$/),
      })
      .loose(),
  })
  .loose();
const objectSchema = z.object({}).loose();

export function checkPayload(topic: WebhookTopic, payload: unknown): PayloadCheck {
  switch (topic) {
    // The privacy webhooks describe a shop and maybe a customer; identity comes from the verified
    // header, never from here, and nothing in the body is stored or logged.
    case "customers/data_request":
    case "customers/redact":
    case "shop/redact":
    case "app/uninstalled":
      // The body describes the shop, but the shop is taken from the verified header, never from here.
      return objectSchema.safeParse(payload).success
        ? { ok: true, resourceId: null }
        : { ok: false };
    case "orders/paid": {
      const order = extractBundlePurchases(payload);
      return order ? { ok: true, resourceId: order.orderId } : { ok: false };
    }
    case "app_subscriptions/update": {
      const parsed = subscriptionSchema.safeParse(payload);
      return parsed.success
        ? { ok: true, resourceId: parsed.data.app_subscription.admin_graphql_api_id }
        : { ok: false };
    }
    case "products/create":
    case "products/update":
    case "products/delete": {
      const parsed = productSchema.safeParse(payload);
      return parsed.success
        ? { ok: true, resourceId: `gid://shopify/Product/${parsed.data.id}` }
        : { ok: false };
    }
  }
}
