/**
 * Minimal Shopify Admin API client. Only what the authentication flow
 * needs (fetching the shop's email right after OAuth, since Shopify.email
 * is a required field on our Shop model but isn't part of the OAuth
 * callback or token exchange response) — not a general-purpose Admin API
 * wrapper.
 */

const ADMIN_API_VERSION = "2025-01";

export class ShopifyAdminApiError extends Error {}

export async function fetchShopEmail(shop: string, accessToken: string): Promise<string> {
  const response = await fetch(`https://${shop}/admin/api/${ADMIN_API_VERSION}/shop.json`, {
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new ShopifyAdminApiError(`Failed to fetch shop info (status ${response.status})`);
  }

  const data = (await response.json()) as { shop?: { email?: string } };
  if (!data.shop?.email) {
    throw new ShopifyAdminApiError("Shopify shop.json response was missing an email");
  }
  return data.shop.email;
}
