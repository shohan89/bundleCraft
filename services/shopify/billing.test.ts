// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShopifyAdminApiError } from "./admin";
import { createBillingGateway, isShopifyConfirmationUrl, ShopifyPermissionError } from "./billing";

/**
 * These tests mock `fetch`, so they prove the requests we build and how we
 * read responses, NOT that Shopify accepts them. That needs a real store
 * (see the ACTION-009 report).
 */
const SHOP = "example.myshopify.com";
const TOKEN = "shpat_super_secret_token";
const GID = "gid://shopify/AppSubscription/42";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

const respond = (body: unknown, status = 200) =>
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
const lastBody = () => JSON.parse((fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string);
const gateway = () => createBillingGateway(SHOP, TOKEN);

const input = {
  name: "BundleCraft Starter",
  amount: 19,
  currencyCode: "USD",
  interval: "EVERY_30_DAYS",
  returnUrl: "https://app.example.com/api/billing/callback",
  test: true,
};

describe("createSubscription", () => {
  it("sends the server's plan terms as a recurring app charge and returns the approval url", async () => {
    respond({
      data: {
        appSubscriptionCreate: {
          appSubscription: { id: GID },
          confirmationUrl: `https://${SHOP}/admin/charges/42/confirm`,
          userErrors: [],
        },
      },
    });
    const result = await gateway().createSubscription(input);
    expect(result).toEqual({
      id: GID,
      confirmationUrl: `https://${SHOP}/admin/charges/42/confirm`,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(new RegExp(`^https://${SHOP}/admin/api/\\d{4}-\\d{2}/graphql\\.json$`));
    expect((init.headers as Record<string, string>)["X-Shopify-Access-Token"]).toBe(TOKEN);
    const body = lastBody();
    expect(body.query).toContain("appSubscriptionCreate");
    expect(body.variables).toEqual({
      name: "BundleCraft Starter",
      returnUrl: "https://app.example.com/api/billing/callback",
      test: true,
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: { amount: 19, currencyCode: "USD" },
              interval: "EVERY_30_DAYS",
            },
          },
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain(TOKEN);
  });

  it("refuses a confirmation url that is not a Shopify page, or a malformed id", async () => {
    for (const confirmationUrl of [
      "https://evil.example.com/pay",
      "http://example.myshopify.com/x",
      "javascript:alert(1)",
      null,
    ]) {
      respond({
        data: {
          appSubscriptionCreate: {
            appSubscription: { id: GID },
            confirmationUrl,
            userErrors: [],
          },
        },
      });
      await expect(gateway().createSubscription(input)).rejects.toBeInstanceOf(
        ShopifyAdminApiError,
      );
    }
    respond({
      data: {
        appSubscriptionCreate: {
          appSubscription: { id: "nope" },
          confirmationUrl: `https://${SHOP}/x`,
          userErrors: [],
        },
      },
    });
    await expect(gateway().createSubscription(input)).rejects.toBeInstanceOf(ShopifyAdminApiError);
  });

  it("fails on userErrors without leaking the token", async () => {
    respond({
      data: {
        appSubscriptionCreate: {
          appSubscription: null,
          confirmationUrl: null,
          userErrors: [{ message: "Price is too high" }],
        },
      },
    });
    const error = await gateway()
      .createSubscription(input)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ShopifyAdminApiError);
    expect((error as Error).message).not.toContain(TOKEN);
  });
});

describe("getSubscription", () => {
  const node = (over: Record<string, unknown> = {}) => ({
    data: {
      node: {
        id: GID,
        name: "BundleCraft Starter",
        status: "ACTIVE",
        test: true,
        currentPeriodEnd: "2026-10-26T00:00:00Z",
        lineItems: [
          {
            plan: {
              pricingDetails: {
                __typename: "AppRecurringPricing",
                interval: "EVERY_30_DAYS",
                price: { amount: "19.0", currencyCode: "USD" },
              },
            },
          },
        ],
        ...over,
      },
    },
  });

  it("returns what Shopify holds, including the price to verify", async () => {
    respond(node());
    expect(await gateway().getSubscription(GID)).toEqual({
      id: GID,
      name: "BundleCraft Starter",
      status: "ACTIVE",
      test: true,
      currentPeriodEnd: "2026-10-26T00:00:00Z",
      price: { amount: 19, currencyCode: "USD", interval: "EVERY_30_DAYS" },
    });
    expect(lastBody().variables).toEqual({ id: GID });
  });

  it("returns null for an unknown subscription or a node of another type", async () => {
    respond({ data: { node: null } });
    expect(await gateway().getSubscription(GID)).toBeNull();
    respond({ data: { node: {} } });
    expect(await gateway().getSubscription(GID)).toBeNull();
    respond(node({ id: "gid://shopify/AppSubscription/999" }));
    expect(await gateway().getSubscription(GID)).toBeNull();
  });

  it("reports no price rather than guessing when it can't be read; rejects unknown statuses", async () => {
    respond(node({ lineItems: [] }));
    expect((await gateway().getSubscription(GID))?.price).toBeNull();
    respond(node({ status: "WEIRD" }));
    await expect(gateway().getSubscription(GID)).rejects.toBeInstanceOf(ShopifyAdminApiError);
  });
});

describe("cancelSubscription", () => {
  it("cancels and reports the resulting status", async () => {
    respond({
      data: {
        appSubscriptionCancel: { appSubscription: { status: "CANCELLED" }, userErrors: [] },
      },
    });
    expect(await gateway().cancelSubscription(GID)).toBe("CANCELLED");
    expect(lastBody().query).toContain("appSubscriptionCancel");
  });

  it("treats a missing subscription as NOT_FOUND, and an already-cancelled refusal as CANCELLED", async () => {
    respond({
      data: {
        appSubscriptionCancel: {
          appSubscription: null,
          userErrors: [{ message: "Subscription does not exist" }],
        },
      },
    });
    expect(await gateway().cancelSubscription(GID)).toBe("NOT_FOUND");

    respond({
      data: {
        appSubscriptionCancel: {
          appSubscription: null,
          userErrors: [{ message: "Cannot cancel" }],
        },
      },
    });
    respond({
      data: { node: { id: GID, name: "BundleCraft Starter", status: "CANCELLED", test: false } },
    });
    expect(await gateway().cancelSubscription(GID)).toBe("CANCELLED");
  });

  it("fails when Shopify refuses and the subscription is still live", async () => {
    respond({
      data: {
        appSubscriptionCancel: { appSubscription: null, userErrors: [{ message: "Nope" }] },
      },
    });
    respond({ data: { node: { id: GID, name: "BundleCraft Starter", status: "ACTIVE" } } });
    await expect(gateway().cancelSubscription(GID)).rejects.toBeInstanceOf(ShopifyAdminApiError);
  });
});

describe("transport errors", () => {
  it("maps 401/403 and ACCESS_DENIED to a permission error, everything else to a generic one", async () => {
    respond({}, 403);
    await expect(gateway().getSubscription(GID)).rejects.toBeInstanceOf(ShopifyPermissionError);
    respond({ errors: [{ message: "x", extensions: { code: "ACCESS_DENIED" } }] });
    await expect(gateway().getSubscription(GID)).rejects.toBeInstanceOf(ShopifyPermissionError);
    respond({}, 502);
    await expect(gateway().getSubscription(GID)).rejects.toBeInstanceOf(ShopifyAdminApiError);
    fetchMock.mockRejectedValueOnce(new TypeError(`connect ECONNREFUSED ${TOKEN}`));
    const error = await gateway()
      .getSubscription(GID)
      .catch((e: unknown) => e);
    expect((error as Error).message).not.toContain(TOKEN);
  });
});

describe("isShopifyConfirmationUrl", () => {
  it("accepts only https Shopify hosts", () => {
    expect(isShopifyConfirmationUrl("https://admin.shopify.com/store/x/charges/1", SHOP)).toBe(
      true,
    );
    expect(isShopifyConfirmationUrl(`https://${SHOP}/admin/charges/1`, SHOP)).toBe(true);
    expect(isShopifyConfirmationUrl("https://shopify.com.evil.io/x", SHOP)).toBe(false);
    expect(isShopifyConfirmationUrl("https://evilmyshopify.com/x", SHOP)).toBe(false);
    expect(isShopifyConfirmationUrl("not a url", SHOP)).toBe(false);
  });
});
