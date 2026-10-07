/**
 * Shopify app-subscription operations (the Billing API): create a recurring
 * charge, read a subscription back, cancel one. Server-only, with the shop's
 * decrypted token supplied by services/billing/gateway.ts.
 *
 * Shopify, not BundleCraft, takes the payment and shows the approval page;
 * we never see or store card data. Everything the merchant is charged is
 * decided by our plan config (lib/billing/plans.ts) and passed in here.
 */
import { ShopifyAdminApiError } from "./admin";
import { createAdminGraphql } from "./graphql";

export { ShopifyPermissionError } from "./graphql";

/** Shopify's AppSubscriptionStatus values. */
export type ShopifySubscriptionStatus =
  "ACTIVE" | "PENDING" | "CANCELLED" | "DECLINED" | "EXPIRED" | "FROZEN";

export interface RemoteSubscription {
  /** gid://shopify/AppSubscription/... */
  id: string;
  name: string;
  status: ShopifySubscriptionStatus;
  test: boolean;
  currentPeriodEnd: string | null;
  /** The recurring price Shopify holds, for comparing against our plan config. */
  price: { amount: number; currencyCode: string; interval: string } | null;
}

export interface CreateSubscriptionInput {
  name: string;
  amount: number;
  currencyCode: string;
  interval: string;
  returnUrl: string;
  /** A Shopify test charge: nothing is billed. */
  test: boolean;
}

export interface BillingGateway {
  createSubscription(
    input: CreateSubscriptionInput,
  ): Promise<{ id: string; confirmationUrl: string }>;
  /** null when Shopify has no such subscription. */
  getSubscription(id: string): Promise<RemoteSubscription | null>;
  /** Returns the resulting status; cancelling an already-cancelled subscription is not an error. */
  cancelSubscription(id: string): Promise<ShopifySubscriptionStatus | "NOT_FOUND">;
}

interface UserError {
  field?: string[] | null;
  message?: string;
}

const SUBSCRIPTION_ID = /^gid:\/\/shopify\/AppSubscription\/\d{1,20}$/;
const STATUSES: readonly string[] = [
  "ACTIVE",
  "PENDING",
  "CANCELLED",
  "DECLINED",
  "EXPIRED",
  "FROZEN",
];
const NOT_FOUND = /not found|does not exist|doesn't exist|invalid id/i;

const CREATE = `
  mutation BundleCraftSubscriptionCreate(
    $name: String!
    $returnUrl: URL!
    $test: Boolean
    $lineItems: [AppSubscriptionLineItemInput!]!
  ) {
    appSubscriptionCreate(name: $name, returnUrl: $returnUrl, test: $test, lineItems: $lineItems) {
      appSubscription { id status }
      confirmationUrl
      userErrors { field message }
    }
  }
`;
const GET = `
  query BundleCraftSubscription($id: ID!) {
    node(id: $id) {
      ... on AppSubscription {
        id
        name
        status
        test
        currentPeriodEnd
        lineItems {
          plan {
            pricingDetails {
              __typename
              ... on AppRecurringPricing { interval price { amount currencyCode } }
            }
          }
        }
      }
    }
  }
`;
const CANCEL = `
  mutation BundleCraftSubscriptionCancel($id: ID!) {
    appSubscriptionCancel(id: $id) {
      appSubscription { id status }
      userErrors { field message }
    }
  }
`;

/**
 * The approval page must be a Shopify page. The URL comes from Shopify's
 * response, but it is checked anyway before it is ever handed to a browser.
 */
export function isShopifyConfirmationUrl(value: string, shopDomain: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === shopDomain ||
        url.hostname === "admin.shopify.com" ||
        url.hostname.endsWith(".myshopify.com"))
    );
  } catch {
    return false;
  }
}

export function createBillingGateway(shop: string, accessToken: string): BillingGateway {
  const graphql = createAdminGraphql(shop, accessToken);

  return {
    async createSubscription(input) {
      const data = await graphql<{
        appSubscriptionCreate: {
          appSubscription: { id: string } | null;
          confirmationUrl: string | null;
          userErrors: UserError[];
        };
      }>(CREATE, {
        name: input.name,
        returnUrl: input.returnUrl,
        test: input.test,
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: { amount: input.amount, currencyCode: input.currencyCode },
                interval: input.interval,
              },
            },
          },
        ],
      });

      const result = data.appSubscriptionCreate;
      if (result.userErrors.length > 0) {
        throw new ShopifyAdminApiError(
          `Could not create subscription: ${result.userErrors.map((e) => e.message ?? "error").join("; ")}`,
        );
      }
      const id = result.appSubscription?.id;
      const url = result.confirmationUrl;
      if (!id || !SUBSCRIPTION_ID.test(id) || !url || !isShopifyConfirmationUrl(url, shop)) {
        throw new ShopifyAdminApiError("Shopify returned an unusable subscription response");
      }
      return { id, confirmationUrl: url };
    },

    async getSubscription(id) {
      const data = await graphql<{
        node: {
          id?: string;
          name?: string;
          status?: string;
          test?: boolean;
          currentPeriodEnd?: string | null;
          lineItems?: {
            plan?: {
              pricingDetails?: {
                __typename?: string;
                interval?: string;
                price?: { amount?: string; currencyCode?: string };
              };
            };
          }[];
        } | null;
      }>(GET, { id });

      const node = data.node;
      if (!node || node.id !== id || !node.name || !node.status) return null;
      if (!STATUSES.includes(node.status)) {
        throw new ShopifyAdminApiError("Shopify returned an unknown subscription status");
      }

      const pricing = node.lineItems?.[0]?.plan?.pricingDetails;
      const amount = pricing?.price?.amount === undefined ? NaN : Number(pricing.price.amount);
      return {
        id,
        name: node.name,
        status: node.status as ShopifySubscriptionStatus,
        test: node.test === true,
        currentPeriodEnd: node.currentPeriodEnd ?? null,
        price:
          pricing?.__typename === "AppRecurringPricing" &&
          Number.isFinite(amount) &&
          pricing.price?.currencyCode &&
          pricing.interval
            ? { amount, currencyCode: pricing.price.currencyCode, interval: pricing.interval }
            : null,
      };
    },

    async cancelSubscription(id) {
      const data = await graphql<{
        appSubscriptionCancel: {
          appSubscription: { status?: string } | null;
          userErrors: UserError[];
        };
      }>(CANCEL, { id });
      const result = data.appSubscriptionCancel;

      if (result.userErrors.length > 0) {
        if (result.userErrors.some((e) => NOT_FOUND.test(e.message ?? ""))) return "NOT_FOUND";
        // "Already cancelled" style refusals: read the truth instead of guessing.
        const current = await this.getSubscription(id);
        if (current?.status === "CANCELLED") return "CANCELLED";
        throw new ShopifyAdminApiError(
          `Could not cancel subscription: ${result.userErrors.map((e) => e.message ?? "error").join("; ")}`,
        );
      }
      const status = result.appSubscription?.status;
      if (!status || !STATUSES.includes(status)) {
        throw new ShopifyAdminApiError("Shopify returned an unknown subscription status");
      }
      return status as ShopifySubscriptionStatus;
    },
  };
}
