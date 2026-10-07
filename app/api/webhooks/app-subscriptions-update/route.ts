import { handleWebhook } from "@/services/webhooks/pipeline";

/** Shopify `app_subscriptions/update` webhook. Everything happens in the shared pipeline (services/webhooks/pipeline.ts). */
export const POST = (request: Request) => handleWebhook(request, ["app_subscriptions/update"]);
