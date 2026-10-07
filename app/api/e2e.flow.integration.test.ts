// @vitest-environment node
import "dotenv/config";
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CartInput } from "@/extensions/bundle-discount/generated/api";
import { cartLinesDiscountsGenerateRun } from "@/extensions/bundle-discount/src/cart_lines_discounts_generate_run";
import { CSRF_HEADER, CSRF_HEADER_VALUE } from "@/lib/api/csrf";
import { createSessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { fakeGateway } from "@/services/discounts/test-instance";
import { grantPlan } from "@/services/billing/testing";
import { GET as analyticsOverview } from "./analytics/overview/route";
import { POST as createBundle } from "./bundles/route";
import { POST as deactivate } from "./bundles/[id]/deactivate/route";
import { POST as publish } from "./bundles/[id]/publish/route";
import { GET as storefrontBundles } from "./storefront/bundles/route";
import { POST as storefrontCart } from "./storefront/cart/route";
import { POST as storefrontEvents } from "./storefront/events/route";
import { POST as ordersPaid } from "./webhooks/orders-paid/route";
import { seedCatalog } from "@/services/products/testing";

/**
 * The whole customer/merchant journey across every layer, with ONLY the
 * Shopify boundaries replaced (product data, the discount API, the checkout
 * engine). It proves the pieces agree with each other: the widget's cart
 * lines are what the Function recognises, the config the server wrote is what
 * the Function obeys, the order the webhook reads is what analytics counts.
 * It is NOT live Shopify verification: nothing here ran on a real storefront,
 * checkout or order.
 */
vi.mock("@/services/discounts/gateway", async () => {
  const { fakeGateway } = await import("@/services/discounts/test-instance");
  return { openDiscountGateway: async () => fakeGateway };
});
vi.mock("@/services/storefront/product-info", () => ({
  getVariantInfo: async (_shop: unknown, ids: string[]) =>
    new Map(
      ids.map((id) => [
        id,
        {
          variantId: id,
          productTitle: `Product ${id}`,
          imageUrl: null,
          variants: [{ id, title: "Default", price: "50.00", available: true }],
        },
      ]),
    ),
}));
let currentCookie: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "bundlecraft_session" && currentCookie ? { name, value: currentCookie } : undefined,
  }),
}));

const SECRET = process.env.SHOPIFY_API_SECRET ?? "";
const canRun =
  Boolean(process.env.DATABASE_URL) && Boolean(process.env.SESSION_SECRET) && Boolean(SECRET);
const DOMAIN_A = "bundlecraft-e2e-a.myshopify.com";
const DOMAIN_B = "bundlecraft-e2e-b.myshopify.com";
const BASE = "http://localhost/api/storefront";

function signed(path: string, extra: Record<string, string> = {}, shop = DOMAIN_A): string {
  const pairs: [string, string][] = [
    ["shop", shop],
    ["path_prefix", "/apps/bundlecraft"],
    ["timestamp", String(Math.floor(Date.now() / 1000))],
    ...Object.entries(extra),
  ];
  const message = [...pairs]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("");
  const signature = createHmac("sha256", SECRET).update(message).digest("hex");
  return `${BASE}${path}?${new URLSearchParams([...pairs, ["signature", signature]])}`;
}

const merchant = (body?: unknown) =>
  new Request("http://localhost/api/x", {
    method: "POST",
    headers: { [CSRF_HEADER]: CSRF_HEADER_VALUE, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe.skipIf(!canRun)("end-to-end journey (mocked Shopify boundaries)", () => {
  let shopA: string;
  let shopB: string;
  let cookieA: string;
  let cookieB: string;
  let bundleId = "";
  let lines: { id: number; quantity: number; properties: Record<string, string> }[] = [];
  let instanceId = "";

  const overview = async (cookie: string) => {
    currentCookie = cookie;
    const response = await analyticsOverview(
      new Request("http://localhost/api/analytics/overview"),
    );
    return (await response.json()) as {
      data: {
        views: number;
        adds: number;
        purchases: number;
        revenue: { amount: number }[];
        conversionRate: number;
      };
    };
  };

  beforeAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    shopA = (
      await prisma.shop.create({
        data: { shopDomain: DOMAIN_A, accessToken: "x", email: "a@example.com" },
      })
    ).id;
    shopB = (
      await prisma.shop.create({
        data: { shopDomain: DOMAIN_B, accessToken: "x", email: "b@example.com" },
      })
    ).id;
    await seedCatalog(shopA, [
      { productId: "1001", variantId: "2001" },
      { productId: "1002", variantId: "2002" },
    ]);
    await grantPlan(shopA, "growth");
    await grantPlan(shopB, "growth");
    const secret = process.env.SESSION_SECRET!;
    cookieA = await createSessionToken({ shopId: shopA, shopDomain: DOMAIN_A }, secret);
    cookieB = await createSessionToken({ shopId: shopB, shopDomain: DOMAIN_B }, secret);
    fakeGateway.reset();
  });
  afterAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    await prisma.$disconnect();
  });

  it("1. merchant creates a fixed bundle as a draft, then publishes it", async () => {
    currentCookie = cookieA;
    const created = await createBundle(
      merchant({
        title: "Complete Look",
        bundleType: "fixed",
        discountType: "percentage",
        discountValue: 20,
        products: [
          { shopifyProductId: "1001", shopifyVariantId: "2001", quantity: 1 },
          { shopifyProductId: "1002", shopifyVariantId: "2002", quantity: 2 },
        ],
      }),
    );
    expect(created.status).toBe(201);
    bundleId = ((await created.json()) as { data: { bundle: { id: string; status: string } } }).data
      .bundle.id;

    const published = await publish(merchant(), ctx(bundleId));
    expect(published.status).toBe(200);
    expect(
      ((await published.json()) as { data: { bundle: { status: string } } }).data.bundle.status,
    ).toBe("active");
    // The server wrote the trusted discount configuration.
    const [discount] = [...fakeGateway.discounts.values()];
    expect(discount).toMatchObject({ active: true, config: { bundleId, discount: { value: 20 } } });
  });

  it("2. analytics start empty (no fake numbers)", async () => {
    expect((await overview(cookieA)).data).toMatchObject({
      views: 0,
      adds: 0,
      purchases: 0,
      revenue: [],
      conversionRate: 0,
    });
  });

  it("3. customer sees the bundle through the signed App Proxy, and the view is recorded once", async () => {
    const listed = await storefrontBundles(new Request(signed("/bundles", { bundleId })));
    const body = (await listed.json()) as { data: { bundles: Record<string, unknown>[] } };
    expect(listed.status).toBe(200);
    expect(body.data.bundles).toHaveLength(1);
    expect(JSON.stringify(body)).not.toMatch(/shopId|status|accessToken|shopify_discount/i);

    const eventId = crypto.randomUUID();
    const send = () =>
      storefrontEvents(
        new Request(signed("/events"), {
          method: "POST",
          body: JSON.stringify({ bundleId, event: "bundle_view", eventId }),
        }),
      );
    expect((await send()).status).toBe(202);
    expect((await send()).status).toBe(202); // retry
    expect((await overview(cookieA)).data.views).toBe(1);
  });

  it("4. customer builds a valid selection; the server returns cart lines carrying the bundle metadata", async () => {
    const response = await storefrontCart(
      new Request(signed("/cart"), {
        method: "POST",
        body: JSON.stringify({
          bundleId,
          selection: [
            { key: "2001", variantId: "2001", quantity: 1 },
            { key: "2002", variantId: "2002", quantity: 2 },
          ],
        }),
      }),
    );
    expect(response.status).toBe(200);
    lines = ((await response.json()) as { data: { items: typeof lines } }).data.items;
    expect(lines.map((l) => [l.id, l.quantity])).toEqual([
      [2001, 1],
      [2002, 2],
    ]);
    instanceId = lines[0].properties._bundle_instance_id;
    expect(lines[0].properties._bundle_id).toBe(bundleId);
    expect(lines[1].properties._bundle_instance_id).toBe(instanceId);
  });

  it("5. an invalid selection (wrong quantity) is refused server-side before any cart line exists", async () => {
    const response = await storefrontCart(
      new Request(signed("/cart"), {
        method: "POST",
        body: JSON.stringify({
          bundleId,
          selection: [{ key: "2001", variantId: "2001", quantity: 1 }],
        }),
      }),
    );
    expect(response.status).toBe(422);
  });

  it("6. bundle_add is recorded with the cart instance id, once, however often it is re-sent", async () => {
    const send = () =>
      storefrontEvents(
        new Request(signed("/events"), {
          method: "POST",
          body: JSON.stringify({
            bundleId,
            event: "bundle_add",
            eventId: crypto.randomUUID(),
            instanceId,
          }),
        }),
      );
    await send();
    await send();
    expect((await overview(cookieA)).data.adds).toBe(1);
  });

  it("7. the discount Function, given those cart lines and ONLY the server-written config, discounts the bundle", () => {
    const config = [...fakeGateway.discounts.values()][0].config;
    const input = {
      cart: {
        cost: { subtotalAmount: { currencyCode: "USD" } },
        lines: lines.map((line, index) => ({
          id: `gid://shopify/CartLine/${index + 1}`,
          quantity: line.quantity,
          bundleId: { value: line.properties._bundle_id },
          instanceId: { value: line.properties._bundle_instance_id },
          cost: { subtotalAmount: { amount: String(50 * line.quantity) } },
          merchandise: {
            __typename: "ProductVariant",
            id: `gid://shopify/ProductVariant/${line.id}`,
            product: { id: `gid://shopify/Product/${line.id - 1000}` },
          },
        })),
      },
      discount: { discountClasses: ["PRODUCT"], configuration: { value: JSON.stringify(config) } },
    } as unknown as CartInput;

    const { operations } = cartLinesDiscountsGenerateRun(input);
    expect(operations).toHaveLength(1);
    expect(JSON.stringify(operations)).toContain('"percentage":{"value":"20"}');

    // Customer tampering with the cart (dropping a product) removes the discount.
    const tampered = structuredClone(input);
    tampered.cart.lines = tampered.cart.lines.slice(0, 1);
    expect(cartLinesDiscountsGenerateRun(tampered).operations).toEqual([]);
  });

  it("8. the paid order is recorded as a purchase with authoritative revenue; a redelivery is not double counted", async () => {
    const order = {
      id: 88001,
      email: "customer@example.com",
      line_items: lines.map((line) => {
        const gross = 50 * line.quantity;
        return {
          quantity: line.quantity,
          price_set: { shop_money: { amount: "50.00", currency_code: "USD" } },
          discount_allocations: [
            {
              amount_set: {
                shop_money: { amount: (gross * 0.2).toFixed(2), currency_code: "USD" },
              },
            },
          ],
          properties: Object.entries(line.properties).map(([name, value]) => ({ name, value })),
        };
      }),
    };
    const raw = JSON.stringify(order);
    const deliver = () =>
      ordersPaid(
        new Request("http://localhost/api/webhooks/orders-paid", {
          method: "POST",
          body: raw,
          headers: {
            "x-shopify-hmac-sha256": createHmac("sha256", SECRET).update(raw).digest("base64"),
            "x-shopify-shop-domain": DOMAIN_A,
            "x-shopify-topic": "orders/paid",
          },
        }),
      );
    expect(await (await deliver()).json()).toEqual({ recorded: 1, skipped: 0 });
    expect(await (await deliver()).json()).toEqual({ duplicate: true });

    const { data } = await overview(cookieA);
    // 3 units x $50 = $150, minus 20% = $120
    expect(data).toMatchObject({ views: 1, adds: 1, purchases: 1, conversionRate: 100 });
    expect(data.revenue).toEqual([{ currency: "USD", amount: 120 }]);
    expect(JSON.stringify(data)).not.toContain("customer@example.com");
  });

  it("9. another shop sees none of it", async () => {
    expect((await overview(cookieB)).data).toMatchObject({
      views: 0,
      adds: 0,
      purchases: 0,
      revenue: [],
    });
    const crossShop = await storefrontBundles(
      new Request(signed("/bundles", { bundleId }, DOMAIN_B)),
    );
    expect(crossShop.status).toBe(404);
  });

  it("10. deactivating stops the storefront offering it and switches the checkout discount off", async () => {
    currentCookie = cookieA;
    expect((await deactivate(merchant(), ctx(bundleId))).status).toBe(200);
    expect([...fakeGateway.discounts.values()].every((d) => !d.active)).toBe(true);
    const listed = await storefrontBundles(new Request(signed("/bundles", { bundleId })));
    expect(listed.status).toBe(404);
  });
});
