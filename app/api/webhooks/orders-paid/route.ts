import { handleWebhook } from "@/services/webhooks/pipeline";

/** Shopify `orders/paid` webhook. Everything happens in the shared pipeline (services/webhooks/pipeline.ts). */
export const POST = (request: Request) => handleWebhook(request, ["orders/paid"]);
