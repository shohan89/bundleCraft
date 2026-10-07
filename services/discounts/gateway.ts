import { getDecryptedAccessToken } from "@/lib/auth/shopify-auth";
import { discountSyncFailed } from "@/lib/bundles/errors";
import { prisma } from "@/lib/prisma";
import { createDiscountGateway, type DiscountGateway } from "@/services/shopify/discounts";

/**
 * A Shopify discount client for one tenant. The shop domain and token are
 * looked up from `shopId` (the verified session's shop) — never taken from a
 * request — and the token stays inside this call chain: it is decrypted here,
 * handed to the client, and never returned, logged, or serialized.
 * Tests replace this module to keep Shopify out of the loop.
 */
export async function openDiscountGateway(shopId: string): Promise<DiscountGateway> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { shopDomain: true, status: true },
  });
  if (!shop || shop.status !== "active") throw discountSyncFailed();

  const token = await getDecryptedAccessToken(shopId);
  if (!token) throw discountSyncFailed();
  return createDiscountGateway(shop.shopDomain, token);
}
