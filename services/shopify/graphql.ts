/**
 * The one Shopify Admin GraphQL transport used by the discount and billing
 * gateways. Server-only: it receives the shop's decrypted token from the
 * gateway factory and never returns, logs or serializes it. Errors carry
 * fixed messages (never response bodies).
 *
 * The version is pinned here, not in each gateway: the discount Function
 * API and the app-subscription mutations both need a version at least as
 * new as extensions/bundle-discount/shopify.extension.toml's api_version,
 * so bump them together.
 */
import { ShopifyAdminApiError } from "./admin";

export const ADMIN_GRAPHQL_VERSION = "2026-07";

/** The app lacks a scope, or the token was rejected (e.g. the app was reinstalled). */
export class ShopifyPermissionError extends ShopifyAdminApiError {}

/** Shopify asked us to slow down (HTTP 429 or a THROTTLED GraphQL error). Safe to retry later. */
export class ShopifyThrottledError extends ShopifyAdminApiError {}

interface GraphqlBody<T> {
  data?: T;
  errors?: { message?: string; extensions?: { code?: string } }[];
}

export type AdminGraphql = <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;

export function createAdminGraphql(shop: string, accessToken: string): AdminGraphql {
  return async function graphql<T>(query: string, variables?: Record<string, unknown>) {
    let response: Response;
    try {
      response = await fetch(`https://${shop}/admin/api/${ADMIN_GRAPHQL_VERSION}/graphql.json`, {
        method: "POST",
        headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ShopifyAdminApiError("Could not reach Shopify");
    }

    if (response.status === 401 || response.status === 403) {
      throw new ShopifyPermissionError(`Shopify rejected the request (status ${response.status})`);
    }
    if (response.status === 429) throw new ShopifyThrottledError("Shopify rate limit reached");
    if (!response.ok) {
      throw new ShopifyAdminApiError(`Shopify request failed (status ${response.status})`);
    }

    let body: GraphqlBody<T>;
    try {
      body = (await response.json()) as GraphqlBody<T>;
    } catch {
      throw new ShopifyAdminApiError("Shopify returned an unreadable response");
    }
    if (body.errors?.length) {
      if (body.errors.some((e) => e.extensions?.code === "ACCESS_DENIED")) {
        throw new ShopifyPermissionError("Shopify denied access");
      }
      if (body.errors.some((e) => e.extensions?.code === "THROTTLED")) {
        throw new ShopifyThrottledError("Shopify rate limit reached");
      }
      throw new ShopifyAdminApiError("Shopify returned a GraphQL error");
    }
    if (!body.data) throw new ShopifyAdminApiError("Shopify returned no data");
    return body.data;
  };
}
