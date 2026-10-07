import { getDecryptedAccessToken } from "@/lib/auth/shopify-auth";
import { shopifyApiError } from "@/lib/billing/errors";
import { prisma } from "@/lib/prisma";
import { createBillingGateway, type BillingGateway } from "@/services/shopify/billing";

/**
 * A Shopify billing client for one tenant. The shop domain and token are
 * looked up from `shopId` (the verified session's shop, or the shop that
 * owns a webhook/callback record), never from a request. The token is
 * decrypted here, handed to the client, and never returned or logged.
 * Tests replace this module so Shopify is never called.
 */
export async function openBillingGateway(shopId: string): Promise<BillingGateway> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { shopDomain: true, status: true },
  });
  if (!shop || shop.status !== "active") throw shopifyApiError();

  const token = await getDecryptedAccessToken(shopId);
  if (!token) throw shopifyApiError();
  return createBillingGateway(shop.shopDomain, token);
}
