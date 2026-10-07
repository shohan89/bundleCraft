import { handleWebhook } from "@/services/webhooks/pipeline";

/**
 * Shopify's three MANDATORY privacy (compliance) webhooks, required for App Store listing:
 * customers/data_request, customers/redact and shop/redact. Shopify delivers all three to this one
 * URL (the topic is in the X-Shopify-Topic header); the shared pipeline verifies the HMAC first.
 * See services/webhooks/handlers/compliance.ts for what each does.
 */
export const POST = (request: Request) =>
  handleWebhook(request, ["customers/data_request", "customers/redact", "shop/redact"]);
