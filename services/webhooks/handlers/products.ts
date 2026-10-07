import { removeProduct, syncProduct } from "@/services/products/sync";
import type { WebhookHandler } from "../types";

/**
 * products/create | update | delete -> the product catalog.
 *
 * create/update: the webhook only says WHICH product changed. The authoritative product
 * (all fields and every variant) is fetched from Shopify and stored, so the local copy
 * never depends on what the payload happens to contain. Idempotent, and an older copy
 * never overwrites newer data. A Shopify or database failure throws, so the pipeline
 * records the event as failed and Shopify retries.
 *
 * delete: the product is marked deleted (kept, so bundles and analytics stay readable;
 * it can no longer be selected, published or bought through a bundle).
 */
export const handleProductEvent: WebhookHandler = async ({ shop, topic, resourceId }) => {
  if (!resourceId) return { ignored: true };

  if (topic === "products/delete") {
    const numericId = /(\d+)$/.exec(resourceId)?.[1];
    if (!numericId) return { ignored: true };
    const { changed } = await removeProduct(shop.id, numericId);
    return { topic, resourceId, deleted: changed };
  }

  const synced = await syncProduct(shop.id, resourceId);
  return { topic, resourceId, result: synced.result, variants: synced.variants };
};
