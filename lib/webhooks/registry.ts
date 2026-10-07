/**
 * The webhook subscriptions BundleCraft expects, in one place. `shopify.app.toml`
 * declares the same list (Shopify manages app-specific subscriptions from that
 * file at deploy time); registry.test.ts fails if the two ever disagree, and
 * app/api/api-security.integration.test.ts fails if a route is missing here.
 */
export const WEBHOOK_TOPICS = [
  "app/uninstalled",
  "orders/paid",
  "app_subscriptions/update",
  "products/create",
  "products/update",
  "products/delete",
  // Mandatory privacy webhooks (App Store requirement); one endpoint receives all three.
  "customers/data_request",
  "customers/redact",
  "shop/redact",
] as const;
export type WebhookTopic = (typeof WEBHOOK_TOPICS)[number];

export interface WebhookEndpoint {
  /** Path Shopify calls, as written in shopify.app.toml. */
  uri: string;
  topics: readonly WebhookTopic[];
}

export const WEBHOOK_ENDPOINTS: readonly WebhookEndpoint[] = [
  { uri: "/api/webhooks/app-uninstalled", topics: ["app/uninstalled"] },
  { uri: "/api/webhooks/orders-paid", topics: ["orders/paid"] },
  { uri: "/api/webhooks/app-subscriptions-update", topics: ["app_subscriptions/update"] },
  {
    uri: "/api/webhooks/products",
    topics: ["products/create", "products/update", "products/delete"],
  },
  {
    uri: "/api/webhooks/compliance",
    topics: ["customers/data_request", "customers/redact", "shop/redact"],
  },
];

/**
 * Topics Shopify delivers for a shop that is no longer active. shopify.app.toml declares the
 * privacy topics as `compliance_topics`, not `topics`.
 */
export const COMPLIANCE_TOPICS = [
  "customers/data_request",
  "customers/redact",
  "shop/redact",
] as const;

export const isWebhookTopic = (value: string | null): value is WebhookTopic =>
  value !== null && (WEBHOOK_TOPICS as readonly string[]).includes(value);
