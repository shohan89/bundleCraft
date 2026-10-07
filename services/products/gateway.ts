import { getDecryptedAccessToken } from "@/lib/auth/shopify-auth";
import { shopifyApiError } from "@/lib/billing/errors";
import { prisma } from "@/lib/prisma";
import { createCatalogGateway, type CatalogGateway } from "@/services/shopify/products";

/**
 * A Shopify product-read client for one tenant. The shop domain and token are
 * looked up from `shopId` (the session shop, or the shop a verified webhook
 * belongs to), never from a request; the token is decrypted here, handed to the
 * client, and never returned or logged. Tests replace this module.
 */
export async function openCatalogGateway(shopId: string): Promise<CatalogGateway> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { shopDomain: true, status: true },
  });
  if (!shop || shop.status !== "active") throw shopifyApiError();

  const token = await getDecryptedAccessToken(shopId);
  if (!token) throw shopifyApiError();
  return createCatalogGateway(shop.shopDomain, token);
}
