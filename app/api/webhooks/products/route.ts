import { handleWebhook } from "@/services/webhooks/pipeline";

/** Shopify products/create, products/update and products/delete: recorded and acknowledged (sync is ACTION-012). */
export const POST = (request: Request) =>
  handleWebhook(request, ["products/create", "products/update", "products/delete"]);
