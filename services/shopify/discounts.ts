/**
 * Shopify Admin GraphQL operations for the app-owned automatic discount
 * that runs the BundleCraft Discount Function (ACTION-007). Runs only on
 * the server with the shop's decrypted token; nothing here is ever sent to
 * a browser and error messages never contain the token or the response body.
 *
 * The Function-based discount API (`discounts.generate.run`) needs an Admin
 * API version that matches the Function's `api_version`
 * (extensions/bundle-discount/shopify.extension.toml), which is newer than
 * the version admin.ts uses for the older calls, so it is pinned here
 * separately and must be bumped together with the extension.
 */
import {
  DISCOUNT_FUNCTION_HANDLE,
  DISCOUNT_METAFIELD_KEY,
  DISCOUNT_METAFIELD_NAMESPACE,
  type DiscountConfig,
} from "@/lib/discounts/config";
import { ShopifyAdminApiError } from "./admin";
import { createAdminGraphql, ShopifyPermissionError } from "./graphql";

export { ShopifyPermissionError };

export type DiscountOutcome = "ok" | "not_found";

export interface DiscountGateway {
  fetchShopCurrency(): Promise<string>;
  /** Creates an active automatic discount carrying `config`; returns its global id. */
  createDiscount(title: string, config: DiscountConfig): Promise<string>;
  /** Updates the title and configuration of an existing discount. */
  updateDiscount(id: string, title: string, config: DiscountConfig): Promise<DiscountOutcome>;
  /** Idempotent: activating an active (or deactivating an inactive) discount is not an error. */
  setActive(id: string, active: boolean): Promise<DiscountOutcome>;
  deleteDiscount(id: string): Promise<DiscountOutcome>;
}

interface UserError {
  field?: string[] | null;
  message?: string;
  code?: string | null;
}

const DISCOUNT_ID_PATTERN = /^gid:\/\/shopify\/DiscountAutomaticNode\/\d{1,20}$/;
const TITLE_MAX = 255;

const NOT_FOUND = /not found|does not exist|doesn't exist|invalid id/i;
const isNotFound = (errors: UserError[]) =>
  errors.some((e) => e.code === "NOT_FOUND" || NOT_FOUND.test(e.message ?? ""));

const CREATE = `
  mutation BundleDiscountCreate($discount: DiscountAutomaticAppInput!) {
    discountAutomaticAppCreate(automaticAppDiscount: $discount) {
      automaticAppDiscount { discountId }
      userErrors { field message code }
    }
  }
`;
const UPDATE = `
  mutation BundleDiscountUpdate($id: ID!, $discount: DiscountAutomaticAppInput!) {
    discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $discount) {
      automaticAppDiscount { discountId }
      userErrors { field message code }
    }
  }
`;
const SET_CONFIG = `
  mutation BundleDiscountConfig($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id }
      userErrors { field message code }
    }
  }
`;
const ACTIVATE = `
  mutation BundleDiscountActivate($id: ID!) {
    discountAutomaticActivate(id: $id) {
      automaticDiscountNode { id }
      userErrors { field message code }
    }
  }
`;
const DEACTIVATE = `
  mutation BundleDiscountDeactivate($id: ID!) {
    discountAutomaticDeactivate(id: $id) {
      automaticDiscountNode { id }
      userErrors { field message code }
    }
  }
`;
const DELETE = `
  mutation BundleDiscountDelete($id: ID!) {
    discountAutomaticDelete(id: $id) {
      deletedAutomaticDiscountId
      userErrors { field message code }
    }
  }
`;
const SHOP_CURRENCY = `query BundleShopCurrency { shop { currencyCode } }`;

const shopifyTitle = (title: string) => `BundleCraft: ${title}`.slice(0, TITLE_MAX);

const configMetafield = (config: DiscountConfig) => ({
  namespace: DISCOUNT_METAFIELD_NAMESPACE,
  key: DISCOUNT_METAFIELD_KEY,
  type: "json",
  value: JSON.stringify(config),
});

export function createDiscountGateway(shop: string, accessToken: string): DiscountGateway {
  const graphql = createAdminGraphql(shop, accessToken);

  const fail = (errors: UserError[], what: string): never => {
    throw new ShopifyAdminApiError(
      `${what}: ${errors.map((e) => e.message ?? "error").join("; ")}`,
    );
  };

  async function writeConfig(id: string, config: DiscountConfig): Promise<DiscountOutcome> {
    const data = await graphql<{ metafieldsSet: { userErrors: UserError[] } }>(SET_CONFIG, {
      metafields: [{ ownerId: id, ...configMetafield(config) }],
    });
    const errors = data.metafieldsSet.userErrors;
    if (errors.length === 0) return "ok";
    if (isNotFound(errors)) return "not_found";
    return fail(errors, "Could not save discount configuration");
  }

  return {
    async fetchShopCurrency() {
      const data = await graphql<{ shop?: { currencyCode?: string } }>(SHOP_CURRENCY);
      const code = data.shop?.currencyCode;
      if (!code || !/^[A-Z]{3}$/.test(code)) {
        throw new ShopifyAdminApiError("Shopify did not return the shop currency");
      }
      return code;
    },

    async createDiscount(title, config) {
      const data = await graphql<{
        discountAutomaticAppCreate: {
          automaticAppDiscount: { discountId: string } | null;
          userErrors: UserError[];
        };
      }>(CREATE, {
        discount: {
          title: shopifyTitle(title),
          functionHandle: DISCOUNT_FUNCTION_HANDLE,
          startsAt: new Date().toISOString(),
          discountClasses: ["PRODUCT"],
          // Conservative default: a bundle price is not stacked with other product/order
          // discounts; free-shipping style discounts still combine.
          combinesWith: { productDiscounts: false, orderDiscounts: false, shippingDiscounts: true },
          metafields: [configMetafield(config)],
        },
      });
      const result = data.discountAutomaticAppCreate;
      if (result.userErrors.length > 0) fail(result.userErrors, "Could not create discount");
      const id = result.automaticAppDiscount?.discountId;
      if (!id || !DISCOUNT_ID_PATTERN.test(id)) {
        throw new ShopifyAdminApiError("Shopify did not return a discount id");
      }
      return id;
    },

    async updateDiscount(id, title, config) {
      const data = await graphql<{
        discountAutomaticAppUpdate: { userErrors: UserError[] };
      }>(UPDATE, { id, discount: { title: shopifyTitle(title) } });
      const errors = data.discountAutomaticAppUpdate.userErrors;
      if (errors.length > 0) {
        if (isNotFound(errors)) return "not_found";
        fail(errors, "Could not update discount");
      }
      return writeConfig(id, config);
    },

    async setActive(id, active) {
      const data = active
        ? (
            await graphql<{ discountAutomaticActivate: { userErrors: UserError[] } }>(ACTIVATE, {
              id,
            })
          ).discountAutomaticActivate
        : (
            await graphql<{ discountAutomaticDeactivate: { userErrors: UserError[] } }>(
              DEACTIVATE,
              { id },
            )
          ).discountAutomaticDeactivate;
      if (data.userErrors.length === 0) return "ok";
      if (isNotFound(data.userErrors)) return "not_found";
      return fail(
        data.userErrors,
        active ? "Could not activate discount" : "Could not deactivate discount",
      );
    },

    async deleteDiscount(id) {
      const data = await graphql<{ discountAutomaticDelete: { userErrors: UserError[] } }>(DELETE, {
        id,
      });
      const errors = data.discountAutomaticDelete.userErrors;
      if (errors.length === 0) return "ok";
      if (isNotFound(errors)) return "not_found";
      return fail(errors, "Could not delete discount");
    },
  };
}
