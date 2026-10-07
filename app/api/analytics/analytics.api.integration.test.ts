// @vitest-environment node
import "dotenv/config";
import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createBundleSeeded as createBundle } from "@/services/products/testing";
import { POST as ordersPaid } from "../webhooks/orders-paid/route";
import { GET as bundleRoute } from "./bundles/[id]/route";
import { GET as overviewRoute } from "./overview/route";
import { grantPlan } from "@/services/billing/testing";

// Route handlers read the session from next/headers' cookie store.
let currentCookie: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "bundlecraft_session" && currentCookie ? { name, value: currentCookie } : undefined,
  }),
}));

const canRun = Boolean(process.env.DATABASE_URL) && Boolean(process.env.SESSION_SECRET);
const DOMAIN_A = "bundlecraft-analytics-api-a.myshopify.com";
const DOMAIN_B = "bundlecraft-analytics-api-b.myshopify.com";
const BASE = "http://localhost/api/analytics";
const WEBHOOK_SECRET = process.env.SHOPIFY_API_SECRET ?? "";

interface Envelope {
  success: boolean;
  data?: Record<string, unknown> & {
    views?: number;
    purchases?: number;
    byBundle?: { bundleId: string; title: string }[];
    analytics?: { bundleId: string; views: number; purchases: number };
  };
  error?: { code: string; message: string };
}
const json = async (response: Response) => (await response.json()) as Envelope;

const overview = (query = "") => overviewRoute(new Request(`${BASE}/overview${query}`));
const bundleAnalytics = (id: string, query = "") =>
  bundleRoute(new Request(`${BASE}/bundles/${id}${query}`), { params: Promise.resolve({ id }) });

describe.skipIf(!canRun)("analytics API (live database)", () => {
  let shopA: string;
  let shopB: string;
  let cookieA: string;
  let cookieB: string;
  let bundleA: string;
  let bundleB: string;

  beforeAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    shopA = (
      await prisma.shop.create({
        data: { shopDomain: DOMAIN_A, accessToken: "x", email: "a@example.com" },
      })
    ).id;
    await grantPlan(shopA, "growth");
    shopB = (
      await prisma.shop.create({
        data: { shopDomain: DOMAIN_B, accessToken: "x", email: "b@example.com" },
      })
    ).id;
    await grantPlan(shopB, "growth");
    const secret = process.env.SESSION_SECRET!;
    cookieA = await createSessionToken({ shopId: shopA, shopDomain: DOMAIN_A }, secret);
    cookieB = await createSessionToken({ shopId: shopB, shopDomain: DOMAIN_B }, secret);

    const draft = (title: string) => ({
      title,
      description: null,
      bundleType: "fixed" as const,
      templateId: null,
      requiredQuantity: null,
      discountType: "percentage" as const,
      discountValue: 20,
      products: [{ shopifyProductId: "1001", shopifyVariantId: "2001", quantity: 1 }],
      customization: null,
    });
    bundleA = (await createBundle(shopA, draft("A bundle"))).id;
    bundleB = (await createBundle(shopB, draft("B bundle"))).id;
    await prisma.analyticsEvent.createMany({
      data: [
        ...Array.from({ length: 10 }, () => ({
          shopId: shopA,
          bundleId: bundleA,
          eventType: "bundle_view" as const,
          eventKey: randomUUID(),
        })),
        {
          shopId: shopA,
          bundleId: bundleA,
          eventType: "bundle_purchase" as const,
          revenue: 80,
          currency: "USD",
          eventKey: randomUUID(),
        },
        ...Array.from({ length: 4 }, () => ({
          shopId: shopB,
          bundleId: bundleB,
          eventType: "bundle_view" as const,
          eventKey: randomUUID(),
        })),
      ],
    });
  });

  beforeEach(() => {
    currentCookie = cookieA;
  });

  afterAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    await prisma.$disconnect();
  });

  describe("authentication", () => {
    it("rejects both endpoints with 401 when there is no session", async () => {
      currentCookie = undefined;
      for (const response of [await overview(), await bundleAnalytics(bundleA)]) {
        expect(response.status).toBe(401);
        expect((await json(response)).error?.code).toBe("UNAUTHORIZED");
      }
    });

    it("rejects a forged or tampered session", async () => {
      currentCookie = `${cookieA}x`;
      expect((await overview()).status).toBe(401);
      currentCookie = "garbage";
      expect((await overview()).status).toBe(401);
    });
  });

  describe("GET /api/analytics/overview", () => {
    it("returns the authenticated shop's metrics", async () => {
      const response = await overview();
      expect(response.status).toBe(200);
      const { data } = await json(response);
      expect(data).toMatchObject({
        views: 10,
        adds: 0,
        purchases: 1,
        revenue: [{ currency: "USD", amount: 80 }],
        conversionRate: 10,
      });
      expect(data?.byBundle?.map((row) => row.bundleId)).toEqual([bundleA]);
    });

    it("gives each shop only its own numbers", async () => {
      currentCookie = cookieB;
      const { data } = await json(await overview());
      expect(data).toMatchObject({ views: 4, purchases: 0, revenue: [], conversionRate: 0 });
      expect(data?.byBundle?.map((row) => row.bundleId)).toEqual([bundleB]);
    });

    it("cannot be pointed at another shop with a shopId parameter", async () => {
      currentCookie = cookieA;
      const { data } = await json(await overview(`?shopId=${shopB}`));
      expect(data?.views).toBe(10); // still A's numbers
    });

    it("applies date and bundle filters", async () => {
      const future = await json(await overview("?startDate=2999-01-01"));
      expect(future.success).toBe(false); // out of range is rejected, not silently empty
      const empty = await json(await overview("?startDate=2100-01-01"));
      expect(empty.data).toMatchObject({ views: 0, purchases: 0 });
      const filtered = await json(await overview(`?bundleId=${bundleA}&startDate=2000-01-01`));
      expect(filtered.data).toMatchObject({ views: 10, bundleId: bundleA, byBundle: [] });
    });

    it("rejects invalid ranges and ids with 400 and a safe message", async () => {
      for (const query of [
        "?startDate=nope",
        "?startDate=2026-09-30&endDate=2026-09-01",
        "?bundleId=abc",
      ]) {
        const response = await overview(query);
        expect(response.status).toBe(400);
        expect((await json(response)).error?.code).toBe("INVALID_REQUEST");
      }
    });

    it("refuses another shop's bundle as a filter with 404", async () => {
      const response = await overview(`?bundleId=${bundleB}`);
      expect(response.status).toBe(404);
      expect((await json(response)).error?.code).toBe("BUNDLE_NOT_FOUND");
    });

    it("never exposes shop ids, event metadata, keys, tokens or internals", async () => {
      const text = JSON.stringify(await json(await overview()));
      expect(text).not.toMatch(
        /shopId|shop_id|metadata|eventKey|orderId|accessToken|prisma|stack/i,
      );
      expect(text).not.toContain(shopA);
      expect(text).not.toContain(shopB);
    });
  });

  describe("GET /api/analytics/bundles/:id", () => {
    it("returns the bundle's totals", async () => {
      const response = await bundleAnalytics(bundleA);
      expect(response.status).toBe(200);
      expect((await json(response)).data?.analytics).toMatchObject({
        bundleId: bundleA,
        views: 10,
        purchases: 1,
      });
    });

    it("blocks another shop's bundle, an unknown bundle, and a malformed id", async () => {
      for (const [id, status] of [
        [bundleB, 404],
        [randomUUID(), 404],
        ["not-a-uuid", 400],
      ] as const) {
        const response = await bundleAnalytics(id);
        expect(response.status).toBe(status);
        expect(JSON.stringify(await json(response))).not.toContain("B bundle");
      }
      currentCookie = cookieB;
      expect((await bundleAnalytics(bundleA)).status).toBe(404);
    });

    it("validates date filters", async () => {
      expect((await bundleAnalytics(bundleA, "?endDate=bad")).status).toBe(400);
    });
  });

  describe("POST /api/webhooks/orders-paid", () => {
    const orderBody = (bundleId: string, orderId: number, instanceId = randomUUID()) =>
      JSON.stringify({
        id: orderId,
        email: "buyer@example.com",
        line_items: [
          {
            quantity: 1,
            price_set: { shop_money: { amount: "30.00", currency_code: "USD" } },
            discount_allocations: [],
            properties: [
              { name: "_bundle_id", value: bundleId },
              { name: "_bundle_instance_id", value: instanceId },
            ],
          },
        ],
      });
    const post = (
      body: string,
      over: { secret?: string; shop?: string; topic?: string; hmac?: string } = {},
    ) =>
      ordersPaid(
        new Request("http://localhost/api/webhooks/orders-paid", {
          method: "POST",
          body,
          headers: {
            "x-shopify-hmac-sha256":
              over.hmac ??
              createHmac("sha256", over.secret ?? WEBHOOK_SECRET)
                .update(body)
                .digest("base64"),
            "x-shopify-shop-domain": over.shop ?? DOMAIN_A,
            "x-shopify-topic": over.topic ?? "orders/paid",
          },
        }),
      );
    const purchases = (bundleId: string) =>
      prisma.analyticsEvent.count({ where: { bundleId, eventType: "bundle_purchase" } });

    it.skipIf(!WEBHOOK_SECRET)("records a purchase from a correctly signed order", async () => {
      const before = await purchases(bundleA);
      const response = await post(orderBody(bundleA, 7001));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ recorded: 1, skipped: 0 });
      expect(await purchases(bundleA)).toBe(before + 1);
    });

    it.skipIf(!WEBHOOK_SECRET)("is idempotent when Shopify redelivers the webhook", async () => {
      const body = orderBody(bundleA, 7002);
      await post(body);
      const before = await purchases(bundleA);
      const retry = await post(body);
      expect(retry.status).toBe(200);
      // The webhook pipeline recognises the redelivery (same body, no event id header) itself.
      expect(await retry.json()).toEqual({ duplicate: true });
      expect(await purchases(bundleA)).toBe(before);
    });

    it.skipIf(!WEBHOOK_SECRET)(
      "rejects a bad signature or tampered body with 401 and records nothing",
      async () => {
        const before = await purchases(bundleA);
        const body = orderBody(bundleA, 7003);
        expect((await post(body, { secret: "wrong" })).status).toBe(401);
        expect((await post(body, { hmac: "" })).status).toBe(401);
        const signedForOther = createHmac("sha256", WEBHOOK_SECRET)
          .update(orderBody(bundleA, 1))
          .digest("base64");
        expect((await post(body, { hmac: signedForOther })).status).toBe(401);
        expect(await purchases(bundleA)).toBe(before);
      },
    );

    it.skipIf(!WEBHOOK_SECRET)(
      "takes the shop from the verified header: another shop's order can't credit this shop's bundle",
      async () => {
        const before = await purchases(bundleA);
        const response = await post(orderBody(bundleA, 7004), { shop: DOMAIN_B });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ recorded: 0, skipped: 1 });
        expect(await purchases(bundleA)).toBe(before);
      },
    );

    it.skipIf(!WEBHOOK_SECRET)(
      "acknowledges without recording unknown shops, other topics and bad shop domains",
      async () => {
        const body = orderBody(bundleA, 7005);
        const before = await purchases(bundleA);
        for (const over of [
          { shop: "nobody.myshopify.com" },
          { topic: "orders/create" },
          { shop: "evil.example.com" },
        ]) {
          const response = await post(body, over);
          expect(response.status).toBe(200);
          expect(await response.json()).toEqual({ ignored: true });
        }
        expect(await purchases(bundleA)).toBe(before);
      },
    );

    it.skipIf(!WEBHOOK_SECRET)(
      "returns 400 for a signed body that isn't JSON, and stores no customer data",
      async () => {
        expect((await post("not json")).status).toBe(400);
        await post(orderBody(bundleA, 7006));
        const rows = await prisma.analyticsEvent.findMany({
          where: { orderId: "gid://shopify/Order/7006" },
        });
        expect(JSON.stringify(rows)).not.toContain("buyer@example.com");
      },
    );
  });
});
