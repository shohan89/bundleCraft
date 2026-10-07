import type { WebhookTopic } from "@/lib/webhooks/registry";

/** The verified shop a webhook belongs to. Handlers only ever act on this shop. */
export interface WebhookShop {
  id: string;
  shopDomain: string;
  status: string;
}

export interface WebhookContext {
  shop: WebhookShop;
  topic: WebhookTopic;
  eventId: string;
  /** Shopify resource id from the validated payload (e.g. a product gid). */
  resourceId: string | null;
  triggeredAt: Date | null;
  /** The parsed body. Verified as Shopify's, but still data: never a source of tenant identity. */
  payload: unknown;
}

/** What a handler reports; becomes the (customer-data-free) 200 response body. */
export type HandlerResult = object;
export type WebhookHandler = (context: WebhookContext) => Promise<HandlerResult>;
