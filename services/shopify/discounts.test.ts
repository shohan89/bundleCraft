// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DiscountConfig } from "@/lib/discounts/config";
import { ShopifyAdminApiError } from "./admin";
import { createDiscountGateway, ShopifyPermissionError } from "./discounts";

/**
 * These tests mock `fetch`, so they prove the requests we build and how we
 * read responses — NOT that Shopify accepts them. That needs a dev store
 * (see docs/13 and the ACTION-007 report).
 */
const SHOP = "example.myshopify.com";
const TOKEN = "shpat_super_secret_token";
const GID = "gid://shopify/DiscountAutomaticNode/42";

const config: DiscountConfig = {
  version: 1,
  bundleId: "b1",
  name: "Look",
  type: "fixed",
  requiredQuantity: null,
  discount: { type: "percentage", value: 20 },
  currencyCode: "USD",
  rows: [{ productId: "1", variantId: "2", quantity: 1 }],
};

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

const respond = (body: unknown, status = 200) =>
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, init, body: JSON.parse(init.body as string) };
};
const gateway = () => createDiscountGateway(SHOP, TOKEN);

describe("createDiscount", () => {
  it("sends an app-owned automatic discount for the bundle-discount Function, config in a $app metafield", async () => {
    respond({
      data: {
        discountAutomaticAppCreate: {
          automaticAppDiscount: { discountId: GID },
          userErrors: [],
        },
      },
    });
    expect(await gateway().createDiscount("Look", config)).toBe(GID);

    const { url, init, body } = lastCall();
    expect(url).toMatch(new RegExp(`^https://${SHOP}/admin/api/\\d{4}-\\d{2}/graphql\\.json$`));
    expect((init.headers as Record<string, string>)["X-Shopify-Access-Token"]).toBe(TOKEN);
    expect(body.query).toContain("discountAutomaticAppCreate");
    const input = body.variables.discount;
    expect(input).toMatchObject({
      title: "BundleCraft: Look",
      functionHandle: "bundle-discount",
      discountClasses: ["PRODUCT"],
    });
    expect(input.metafields).toEqual([
      {
        namespace: "$app:bundlecraft",
        key: "config",
        type: "json",
        value: JSON.stringify(config),
      },
    ]);
  });

  it("never puts the token in the request body", async () => {
    respond({
      data: {
        discountAutomaticAppCreate: { automaticAppDiscount: { discountId: GID }, userErrors: [] },
      },
    });
    await gateway().createDiscount("Look", config);
    expect(JSON.stringify(lastCall().body)).not.toContain(TOKEN);
  });

  it("fails on userErrors and on a malformed id, without leaking the token", async () => {
    respond({
      data: {
        discountAutomaticAppCreate: {
          automaticAppDiscount: null,
          userErrors: [{ field: ["title"], message: "Title is invalid" }],
        },
      },
    });
    const error = await gateway()
      .createDiscount("Look", config)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ShopifyAdminApiError);
    expect((error as Error).message).not.toContain(TOKEN);

    respond({
      data: {
        discountAutomaticAppCreate: {
          automaticAppDiscount: { discountId: "nope" },
          userErrors: [],
        },
      },
    });
    await expect(gateway().createDiscount("Look", config)).rejects.toBeInstanceOf(
      ShopifyAdminApiError,
    );
  });
});

describe("update / activate / deactivate / delete", () => {
  it("update writes the title, then the config metafield on the discount", async () => {
    respond({ data: { discountAutomaticAppUpdate: { userErrors: [] } } });
    respond({ data: { metafieldsSet: { userErrors: [] } } });
    expect(await gateway().updateDiscount(GID, "New", config)).toBe("ok");

    const [first, second] = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body as string));
    expect(first.variables).toMatchObject({ id: GID, discount: { title: "BundleCraft: New" } });
    expect(second.variables.metafields).toEqual([
      {
        ownerId: GID,
        namespace: "$app:bundlecraft",
        key: "config",
        type: "json",
        value: JSON.stringify(config),
      },
    ]);
  });

  it("maps a discount that no longer exists to not_found, for every operation", async () => {
    const notFound = [{ field: ["id"], message: "Discount does not exist" }];
    respond({ data: { discountAutomaticAppUpdate: { userErrors: notFound } } });
    expect(await gateway().updateDiscount(GID, "x", config)).toBe("not_found");
    respond({ data: { discountAutomaticActivate: { userErrors: notFound } } });
    expect(await gateway().setActive(GID, true)).toBe("not_found");
    respond({ data: { discountAutomaticDeactivate: { userErrors: notFound } } });
    expect(await gateway().setActive(GID, false)).toBe("not_found");
    respond({ data: { discountAutomaticDelete: { userErrors: notFound } } });
    expect(await gateway().deleteDiscount(GID)).toBe("not_found");
  });

  it("activate and deactivate use the matching mutations", async () => {
    respond({ data: { discountAutomaticActivate: { userErrors: [] } } });
    await gateway().setActive(GID, true);
    expect(lastCall().body.query).toContain("discountAutomaticActivate");
    respond({ data: { discountAutomaticDeactivate: { userErrors: [] } } });
    await gateway().setActive(GID, false);
    expect(lastCall().body.query).toContain("discountAutomaticDeactivate");
  });
});

describe("failure handling", () => {
  it("treats missing access (HTTP 401/403 or ACCESS_DENIED) as a permission problem", async () => {
    respond({}, 403);
    await expect(gateway().setActive(GID, true)).rejects.toBeInstanceOf(ShopifyPermissionError);
    respond({ errors: [{ message: "Access denied", extensions: { code: "ACCESS_DENIED" } }] });
    await expect(gateway().setActive(GID, true)).rejects.toBeInstanceOf(ShopifyPermissionError);
  });

  it("turns 5xx, GraphQL errors, network failures and unreadable bodies into a generic error", async () => {
    respond({}, 502);
    await expect(gateway().fetchShopCurrency()).rejects.toBeInstanceOf(ShopifyAdminApiError);
    respond({ errors: [{ message: "Throttled" }] });
    await expect(gateway().fetchShopCurrency()).rejects.toBeInstanceOf(ShopifyAdminApiError);
    fetchMock.mockRejectedValueOnce(new TypeError(`connect ECONNREFUSED ${TOKEN}`));
    const error = await gateway()
      .fetchShopCurrency()
      .catch((e: unknown) => e);
    expect((error as Error).message).not.toContain(TOKEN);
    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 200 }));
    await expect(gateway().fetchShopCurrency()).rejects.toBeInstanceOf(ShopifyAdminApiError);
  });

  it("reads the shop currency and rejects a missing one", async () => {
    respond({ data: { shop: { currencyCode: "EUR" } } });
    expect(await gateway().fetchShopCurrency()).toBe("EUR");
    respond({ data: { shop: {} } });
    await expect(gateway().fetchShopCurrency()).rejects.toBeInstanceOf(ShopifyAdminApiError);
  });
});
