// @vitest-environment node
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { AnalyticsEventType } from "@/lib/analytics/types";
import type { BundleDraftInput } from "@/lib/bundles/types";
import { prisma } from "@/lib/prisma";
import { createBundleSeeded as createBundle } from "@/services/products/testing";
import { getDashboardOverview } from "@/services/dashboard/overview";
import { listBundlesForShop } from "@/services/dashboard/bundles";
import { recordOrderPurchases } from "./purchases";
import { getAnalyticsOverview, getBundleAnalytics, getTotals } from "./queries";
import { trackStorefrontEvent } from "./track";

/**
 * Live database, two throwaway shops (removed afterwards; events go with
 * them via ON DELETE CASCADE). Skipped when no DATABASE_URL is configured.
 */
const canRun = Boolean(process.env.DATABASE_URL);
const DOMAIN_A = "bundlecraft-analytics-test-a.myshopify.com";
const DOMAIN_B = "bundlecraft-analytics-test-b.myshopify.com";
const DOMAIN_C = "bundlecraft-analytics-test-c.myshopify.com";

const draft = (title: string): BundleDraftInput => ({
  title,
  description: null,
  bundleType: "fixed",
  templateId: null,
  requiredQuantity: null,
  discountType: "percentage",
  discountValue: 20,
  products: [{ shopifyProductId: "1001", shopifyVariantId: "2001", quantity: 1 }],
  customization: null,
});

async function expectApiError(promise: Promise<unknown>, code: string, status: number) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ code, status });
}

const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

describe.skipIf(!canRun)("analytics service (live database)", () => {
  let shopA: string;
  let shopB: string;
  let bundleA1: string;
  let bundleA2: string;
  let bundleB1: string;

  /** Inserts `count` events straight into the table, the way the engine would have. */
  async function seed(
    shopId: string,
    bundleId: string,
    eventType: AnalyticsEventType,
    count: number,
    over: { createdAt?: Date; revenue?: number; currency?: string } = {},
  ) {
    await prisma.analyticsEvent.createMany({
      data: Array.from({ length: count }, () => ({
        shopId,
        bundleId,
        eventType,
        createdAt: over.createdAt,
        revenue: over.revenue,
        currency: over.currency,
        eventKey: randomUUID(),
      })),
    });
  }

  beforeAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B, DOMAIN_C] } } });
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
    bundleA1 = (await createBundle(shopA, draft("Complete Look"))).id;
    bundleA2 = (await createBundle(shopA, draft("Skincare Set"))).id;
    bundleB1 = (await createBundle(shopB, draft("Other Shop Bundle"))).id;
    await prisma.bundle.updateMany({
      where: { id: { in: [bundleA1, bundleA2, bundleB1] } },
      data: { status: "active" },
    });
  });

  afterAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    await prisma.$disconnect();
  });

  describe("an empty store", () => {
    it("is all zeros with no NaN, no revenue, and no bundle rows", async () => {
      const overview = await getAnalyticsOverview(shopA);
      expect(overview).toMatchObject({
        views: 0,
        adds: 0,
        purchases: 0,
        revenue: [],
        conversionRate: 0,
        byBundle: [],
      });
      expect(Number.isNaN(overview.conversionRate)).toBe(false);
      expect((await getDashboardOverview(shopA)).totals.views).toBe(0);
    });
  });

  describe("storefront events (bundle_view / bundle_add)", () => {
    it("stores a valid view and add for an active bundle of the shop", async () => {
      const view = await trackStorefrontEvent(shopA, {
        bundleId: bundleA1,
        event: "bundle_view",
        eventId: randomUUID(),
      });
      const instanceId = randomUUID();
      const add = await trackStorefrontEvent(shopA, {
        bundleId: bundleA1,
        event: "bundle_add",
        eventId: randomUUID(),
        instanceId,
      });
      expect([view.recorded, add.recorded]).toEqual([true, true]);
      expect(await prisma.analyticsEvent.count({ where: { shopId: shopA } })).toBe(2);
    });

    it("counts a duplicate (same event id, or same cart instance) once", async () => {
      const eventId = randomUUID();
      const instanceId = randomUUID();
      const results = await Promise.all([
        trackStorefrontEvent(shopA, { bundleId: bundleA2, event: "bundle_view", eventId }),
        trackStorefrontEvent(shopA, { bundleId: bundleA2, event: "bundle_view", eventId }),
        trackStorefrontEvent(shopA, {
          bundleId: bundleA2,
          event: "bundle_add",
          eventId: randomUUID(),
          instanceId,
        }),
        trackStorefrontEvent(shopA, {
          bundleId: bundleA2,
          event: "bundle_add",
          eventId: randomUUID(),
          instanceId,
        }),
      ]);
      expect(results.filter((r) => r.recorded)).toHaveLength(2);
      expect(await prisma.analyticsEvent.count({ where: { bundleId: bundleA2 } })).toBe(2);
    });

    it("refuses another shop's bundle, an inactive bundle and an unknown bundle, storing nothing", async () => {
      const scope = { shopId: { in: [shopA, shopB] } };
      const before = await prisma.analyticsEvent.count({ where: scope });
      const event = { event: "bundle_view" as const, eventId: randomUUID() };
      await expectApiError(
        trackStorefrontEvent(shopA, { ...event, bundleId: bundleB1 }),
        "BUNDLE_NOT_FOUND",
        404,
      );
      await expectApiError(
        trackStorefrontEvent(shopA, { ...event, bundleId: randomUUID() }),
        "BUNDLE_NOT_FOUND",
        404,
      );
      const inactive = (await createBundle(shopA, draft("Draft"))).id;
      await expectApiError(
        trackStorefrontEvent(shopA, { ...event, bundleId: inactive }),
        "BUNDLE_NOT_FOUND",
        404,
      );
      expect(await prisma.analyticsEvent.count({ where: scope })).toBe(before);
    });
  });

  describe("purchases from an order", () => {
    const orderFor = (
      bundleId: string,
      instanceId: string,
      over: { id?: number; price?: string } = {},
    ) => ({
      id: over.id ?? 9001,
      line_items: [
        {
          quantity: 2,
          price_set: { shop_money: { amount: over.price ?? "40.00", currency_code: "USD" } },
          discount_allocations: [
            { amount_set: { shop_money: { amount: "16.00", currency_code: "USD" } } },
          ],
          properties: [
            { name: "_bundle_id", value: bundleId },
            { name: "_bundle_instance_id", value: instanceId },
          ],
        },
      ],
    });

    it("records one purchase with authoritative revenue, currency and order reference", async () => {
      const instanceId = randomUUID();
      const result = await recordOrderPurchases(shopA, orderFor(bundleA1, instanceId));
      expect(result).toEqual({ recorded: 1, skipped: 0 });

      const row = await prisma.analyticsEvent.findFirstOrThrow({
        where: { bundleId: bundleA1, eventType: "bundle_purchase" },
      });
      expect(row).toMatchObject({
        shopId: shopA,
        currency: "USD",
        orderId: "gid://shopify/Order/9001",
      });
      expect(row.revenue?.toNumber()).toBe(64); // 2 x 40.00 - 16.00
      expect(row.metadataJson).toMatchObject({ instanceId, source: "order_webhook", units: 2 });
    });

    it("a redelivered webhook, or the same order twice, is not counted again", async () => {
      const instanceId = randomUUID();
      const order = orderFor(bundleA2, instanceId, { id: 9002 });
      const first = await recordOrderPurchases(shopA, order);
      const retry = await recordOrderPurchases(shopA, order);
      expect(first.recorded).toBe(1);
      expect(retry).toEqual({ recorded: 0, skipped: 1 });
      expect(
        await prisma.analyticsEvent.count({
          where: { bundleId: bundleA2, eventType: "bundle_purchase" },
        }),
      ).toBe(1);
    });

    it("ignores a bundle id that belongs to another shop (a forged property can't cross tenants)", async () => {
      const result = await recordOrderPurchases(
        shopA,
        orderFor(bundleB1, randomUUID(), { id: 9003 }),
      );
      expect(result).toEqual({ recorded: 0, skipped: 1 });
      expect(await prisma.analyticsEvent.count({ where: { bundleId: bundleB1 } })).toBe(0);
    });

    it("records nothing for orders without bundles or for payloads that aren't orders", async () => {
      expect(await recordOrderPurchases(shopA, { id: 9004, line_items: [] })).toEqual({
        recorded: 0,
        skipped: 0,
      });
      expect(await recordOrderPurchases(shopA, { nonsense: true })).toEqual({
        recorded: 0,
        skipped: 0,
      });
    });
  });

  describe("aggregation", () => {
    let shopId: string;
    let bundleX: string;
    let bundleY: string;

    beforeAll(async () => {
      // A dedicated pair so totals are exact: 100 views / 10 purchases on X, 20 / 1 on Y.
      shopId = (
        await prisma.shop.create({
          data: {
            shopDomain: DOMAIN_C,
            accessToken: "x",
            email: "c@example.com",
          },
        })
      ).id;
      bundleX = (await createBundle(shopId, draft("X"))).id;
      bundleY = (await createBundle(shopId, draft("Y"))).id;

      await seed(shopId, bundleX, "bundle_view", 60, { createdAt: day("2026-01-10") });
      await seed(shopId, bundleX, "bundle_view", 40, { createdAt: day("2026-03-10") });
      await seed(shopId, bundleX, "bundle_add", 30, { createdAt: day("2026-03-10") });
      await seed(shopId, bundleX, "bundle_purchase", 4, {
        createdAt: day("2026-01-10"),
        revenue: 25.5,
        currency: "USD",
      });
      await seed(shopId, bundleX, "bundle_purchase", 6, {
        createdAt: day("2026-03-10"),
        revenue: 25.5,
        currency: "USD",
      });
      await seed(shopId, bundleY, "bundle_view", 20, { createdAt: day("2026-03-10") });
      await seed(shopId, bundleY, "bundle_purchase", 1, {
        createdAt: day("2026-03-10"),
        revenue: 12,
        currency: "EUR",
      });
    });

    afterAll(async () => {
      await prisma.shop.deleteMany({ where: { id: shopId } });
    });

    it("counts each event type and sums revenue per currency", async () => {
      expect(await getTotals(shopId)).toEqual({
        views: 120,
        adds: 30,
        purchases: 11,
        revenue: [
          { currency: "USD", amount: 255 },
          { currency: "EUR", amount: 12 },
        ],
        conversionRate: 9.17,
      });
    });

    it("100 views and 10 purchases is a 10% conversion rate", async () => {
      const x = await getBundleAnalytics(shopId, bundleX);
      expect(x).toMatchObject({ views: 100, purchases: 10, conversionRate: 10, title: "X" });
      expect(x.revenue).toEqual([{ currency: "USD", amount: 255 }]);
    });

    it("filters by date, inclusive at both ends", async () => {
      const march = await getAnalyticsOverview(shopId, {
        from: new Date("2026-03-01T00:00:00Z"),
        to: new Date("2026-03-31T23:59:59.999Z"),
        bundleId: null,
      });
      expect(march).toMatchObject({ views: 60, adds: 30, purchases: 7 });
      expect(march.revenue).toEqual([
        { currency: "USD", amount: 153 },
        { currency: "EUR", amount: 12 },
      ]);

      const exact = await getTotals(shopId, {
        from: day("2026-01-10"),
        to: day("2026-01-10"),
        bundleId: null,
      });
      expect(exact).toMatchObject({ views: 60, purchases: 4 });

      const none = await getTotals(shopId, {
        from: new Date("2027-01-01T00:00:00Z"),
        to: null,
        bundleId: null,
      });
      expect(none).toMatchObject({ views: 0, purchases: 0, conversionRate: 0, revenue: [] });
    });

    it("filters by bundle, and combines with dates", async () => {
      const y = await getAnalyticsOverview(shopId, { from: null, to: null, bundleId: bundleY });
      expect(y).toMatchObject({ views: 20, purchases: 1, conversionRate: 5, byBundle: [] });
      expect(y.revenue).toEqual([{ currency: "EUR", amount: 12 }]);

      const xJan = await getAnalyticsOverview(shopId, {
        from: new Date("2026-01-01T00:00:00Z"),
        to: new Date("2026-01-31T23:59:59.999Z"),
        bundleId: bundleX,
      });
      expect(xJan).toMatchObject({ views: 60, purchases: 4 });
    });

    it("breaks the overview down per bundle, best revenue first", async () => {
      const { byBundle } = await getAnalyticsOverview(shopId);
      expect(byBundle.map((row) => [row.title, row.views, row.purchases])).toEqual([
        ["X", 100, 10],
        ["Y", 20, 1],
      ]);
      expect(byBundle[0].conversionRate).toBe(10);
    });

    it("uses database aggregation: no raw events are loaded", async () => {
      const findMany = vi.spyOn(prisma.analyticsEvent, "findMany");
      await getAnalyticsOverview(shopId);
      await getBundleAnalytics(shopId, bundleX);
      expect(findMany).not.toHaveBeenCalled();
      findMany.mockRestore();
    });

    it("the dashboard list and home summary read the same numbers", async () => {
      const list = await listBundlesForShop(shopId);
      expect(list.find((b) => b.id === bundleX)?.revenue).toEqual([
        { currency: "USD", amount: 255 },
      ]);
      expect(list.find((b) => b.id === bundleY)?.revenue).toEqual([
        { currency: "EUR", amount: 12 },
      ]);
      expect((await getDashboardOverview(shopId)).totals).toMatchObject({
        views: 120,
        purchases: 11,
      });
    });
  });

  describe("tenant isolation", () => {
    it("shop A's numbers never include shop B's events, and vice versa", async () => {
      await seed(shopB, bundleB1, "bundle_view", 7);
      await seed(shopB, bundleB1, "bundle_purchase", 3, { revenue: 500, currency: "USD" });

      const a = await getAnalyticsOverview(shopA);
      const b = await getAnalyticsOverview(shopB);
      expect(b).toMatchObject({
        views: 7,
        purchases: 3,
        revenue: [{ currency: "USD", amount: 1500 }],
      });
      expect(a.revenue.every((money) => money.amount < 1500)).toBe(true);
      expect(a.byBundle.map((row) => row.bundleId)).not.toContain(bundleB1);
      expect(b.byBundle.map((row) => row.bundleId)).toEqual([bundleB1]);
    });

    it("shop A cannot read shop B's bundle analytics, by bundle endpoint or overview filter", async () => {
      await expectApiError(getBundleAnalytics(shopA, bundleB1), "BUNDLE_NOT_FOUND", 404);
      await expectApiError(
        getAnalyticsOverview(shopA, { from: null, to: null, bundleId: bundleB1 }),
        "BUNDLE_NOT_FOUND",
        404,
      );
      await expectApiError(getBundleAnalytics(shopA, randomUUID()), "BUNDLE_NOT_FOUND", 404);
    });

    it("the dashboard bundle list shows only the shop's own bundles", async () => {
      const ids = (await listBundlesForShop(shopA)).map((bundle) => bundle.id);
      expect(ids).toContain(bundleA1);
      expect(ids).not.toContain(bundleB1);
    });
  });
});
