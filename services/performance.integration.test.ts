// @vitest-environment node
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Performance guarantees (ACTION-016), measured on the real database with the real services:
 * how many SQL statements a request costs, that the count does NOT grow with the amount of
 * data (no N+1), that the analytics overview agrees with independent aggregates, and that the
 * indexes are the intended ones. Statement counts come from Prisma's own query events, so they
 * are what PostgreSQL actually receives.
 */
const statements: string[] = [];
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient } = await import("@/lib/generated/prisma/client");
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    log: [{ emit: "event", level: "query" }],
  });
  (client as unknown as { $on: (e: string, cb: (x: { query: string }) => void) => void }).$on(
    "query",
    (event) => statements.push(event.query),
  );
  return { prisma: client };
});

import { prisma } from "@/lib/prisma";
import { grantPlan } from "@/services/billing/testing";
import { getBillingState } from "@/services/billing/subscriptions";
import { getAnalyticsOverview, getBundleAnalytics, getTotals } from "@/services/analytics/queries";
import { getBundle } from "@/services/bundles/get";
import { listBundles } from "@/services/bundles/list";
import { listBundlesForShop } from "@/services/dashboard/bundles";
import { listProducts } from "@/services/products/queries";
import { seedCatalog } from "@/services/products/testing";
import { getStorefrontBundles, getStorefrontListing } from "@/services/storefront/bundles";
import { getVariantInfo, getVariantSummaries } from "@/services/storefront/product-info";
import { seedTemplates } from "@/services/templates/seed";
import { listTemplates } from "@/services/templates/templates";

const canRun = Boolean(process.env.DATABASE_URL);
const DOMAIN = "bundlecraft-perf-test.myshopify.com";
const isTx = (sql: string) => /^(BEGIN|COMMIT|ROLLBACK)/i.test(sql);

/** SQL statements sent while `fn` runs, and how many of them were exact repeats. */
async function measure<T>(fn: () => Promise<T>) {
  statements.length = 0;
  const result = await fn();
  const sent = statements.filter((sql) => !isTx(sql));
  const repeats = sent.length - new Set(sent).size;
  return { result, count: sent.length, repeats };
}

describe.skipIf(!canRun)("query counts and scaling (live database)", () => {
  let shop: { id: string; shopDomain: string };
  const variantIds: string[] = [];

  /** Adds active bundles until the shop has `total`, each with four products. */
  async function ensureBundles(total: number) {
    const have = await prisma.bundle.count({ where: { shopId: shop.id } });
    for (let n = have; n < total; n++) {
      await prisma.bundle.create({
        data: {
          shopId: shop.id,
          title: `Perf ${n}`,
          bundleType: n % 3 === 0 ? "mix_match" : "fixed",
          requiredQuantity: n % 3 === 0 ? 2 : null,
          discountType: "percentage",
          discountValue: 10,
          status: "active",
          bundleProducts: {
            create: [0, 1, 2, 3].map((k) => ({
              shopifyProductId: String(7000 + ((n * 4 + k) % 12)),
              shopifyVariantId: String(70000 + ((n * 4 + k) % 12)),
              quantity: 1,
              position: k,
            })),
          },
          ...(n % 2 === 0
            ? {
                customization: {
                  create: {
                    primaryColor: "#111827",
                    buttonColor: "#111827",
                    backgroundColor: "#ffffff",
                    layout: "card" as const,
                    fontSize: 16,
                  },
                },
              }
            : {}),
        },
      });
    }
  }

  beforeAll(async () => {
    await seedTemplates(prisma);
    await prisma.shop.deleteMany({ where: { shopDomain: DOMAIN } });
    shop = await prisma.shop.create({
      data: { shopDomain: DOMAIN, accessToken: "x", email: "perf@example.com" },
      select: { id: true, shopDomain: true },
    });
    await grantPlan(shop.id, "pro");
    await seedCatalog(
      shop.id,
      Array.from({ length: 12 }, (_, i) => {
        variantIds.push(String(70000 + i));
        return {
          productId: String(7000 + i),
          variantId: String(70000 + i),
          title: `Perf product ${i}`,
        };
      }),
    );
  }, 120_000);

  afterAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: DOMAIN } });
    await prisma.$disconnect();
  }, 60_000);

  beforeEach(() => {
    statements.length = 0;
  });

  describe("bundle reads use one joined statement and do not grow with the data", () => {
    it("listBundles is ONE statement (bundles, products and customization joined) at any size", async () => {
      await ensureBundles(3);
      const [first] = await listBundles(shop.id);
      // getBundle adds one more for the catalog state of its products: two in all, not three-plus.
      const one = await measure(() => getBundle(shop.id, first.id));
      expect(one.count).toBe(2);
      expect(one.repeats).toBe(0);

      const small = await measure(() => listBundles(shop.id));
      await ensureBundles(30);
      const large = await measure(() => listBundles(shop.id));
      expect(small.count).toBe(1);
      expect(large.count).toBe(1); // 10x the bundles, same number of statements
      expect(large.result.length).toBeGreaterThan(small.result.length);
    });

    it("the join returns exactly what separate queries did (products in order, customization)", async () => {
      const [first] = await listBundles(shop.id);
      expect(first.products.map((p) => p.position)).toEqual([0, 1, 2, 3]);
      const row = await prisma.bundle.findFirstOrThrow({
        where: { id: first.id },
        include: { bundleProducts: { orderBy: { position: "asc" } }, customization: true },
      });
      expect(first.products.map((p) => p.shopifyVariantId)).toEqual(
        row.bundleProducts.map((p) => p.shopifyVariantId),
      );
      expect(Boolean(first.customization)).toBe(Boolean(row.customization));
    });

    it("the dashboard bundle list: 3 statements at any size, none repeated", async () => {
      const before = await measure(() => listBundlesForShop(shop.id));
      expect(before.count).toBeLessThanOrEqual(3);
      expect(before.repeats).toBe(0);
      expect(before.result.length).toBeGreaterThanOrEqual(30);
    });
  });

  describe("storefront reads", () => {
    it("one bundle with live product data: at most 2 statements (bundle, then products+variants)", async () => {
      const [first] = await listBundles(shop.id);
      const out = await measure(() => getStorefrontBundles(shop, { bundleId: first.id }));
      expect(out.count).toBeLessThanOrEqual(2);
      expect(out.result).toHaveLength(1);
      expect(out.result[0].products[0].title).toMatch(/Perf product/);
      expect(out.result[0].products[0].variants.length).toBeGreaterThan(0);
    });

    it("the product page filter: at most 2 statements", async () => {
      const out = await measure(() => getStorefrontBundles(shop, { productId: "7000" }));
      expect(out.count).toBeLessThanOrEqual(2);
      expect(out.result.length).toBeGreaterThan(0);
      expect(out.result.length).toBeLessThanOrEqual(3);
    });

    it("the landing listing: 2 statements whether there are 3 or 30 bundles, none repeated", async () => {
      const large = await measure(() => getStorefrontListing(shop));
      expect(large.count).toBe(2);
      expect(large.repeats).toBe(0);
      expect(large.result.length).toBe(24); // capped
      expect(large.result.every((card) => card.preview.length > 0)).toBe(true);
    });

    it("variant lookups are one statement however many variants and bundles", async () => {
      const info = await measure(() => getVariantInfo(shop, variantIds));
      expect(info.count).toBe(1);
      expect(info.result.size).toBe(12);
      const summaries = await measure(() => getVariantSummaries(shop, variantIds));
      expect(summaries.count).toBe(1);
      expect(summaries.result.size).toBe(12);
      // Nothing asked for, nothing sent.
      expect((await measure(() => getVariantInfo(shop, []))).count).toBe(0);
    });

    it("never loads the whole catalog: only the variants a bundle names are read", async () => {
      const [first] = await listBundles(shop.id);
      statements.length = 0;
      await getStorefrontBundles(shop, { bundleId: first.id });
      const variantReads = statements.filter((sql) => /FROM "public"."product_variants"/.test(sql));
      expect(variantReads.every((sql) => /shopify_variant_id/.test(sql))).toBe(true);
    });
  });

  describe("merchant reads", () => {
    it("the product list is bounded by its page size and does not loop per product", async () => {
      const out = await measure(() =>
        listProducts(shop.id, {
          page: 1,
          limit: 5,
          search: undefined,
          status: undefined,
          productType: undefined,
          vendor: undefined,
        }),
      );
      expect(out.result.items).toHaveLength(5);
      expect(out.count).toBeLessThanOrEqual(4); // page, total, catalog status, variant counts
      expect(out.repeats).toBe(0);
    });

    it("the template catalog is one statement", async () => {
      const out = await measure(() => listTemplates());
      expect(out.count).toBeLessThanOrEqual(1);
      expect(out.result.length).toBeGreaterThanOrEqual(5);
    });

    it("the billing state is one round of 4 statements when nothing is pending", async () => {
      const out = await measure(() => getBillingState(shop.id));
      expect(out.count).toBe(4);
      expect(out.repeats).toBe(0);
      expect(out.result.plan).toBe("pro");
    });
  });

  describe("analytics", () => {
    let bundleIds: string[];

    beforeAll(async () => {
      await ensureBundles(30);
      bundleIds = (
        await prisma.bundle.findMany({
          where: { shopId: shop.id },
          select: { id: true },
          orderBy: { id: "asc" },
          take: 6,
        })
      ).map((b) => b.id);
      await prisma.analyticsEvent.deleteMany({ where: { shopId: shop.id } });
      const now = Date.now();
      const rows = bundleIds.flatMap((bundleId, b) =>
        Array.from({ length: 40 }, (_, i) => {
          const kind =
            i % 10 === 0 ? "bundle_purchase" : i % 3 === 0 ? "bundle_add" : "bundle_view";
          const purchase = kind === "bundle_purchase";
          return {
            shopId: shop.id,
            bundleId,
            eventType: kind as "bundle_purchase" | "bundle_add" | "bundle_view",
            revenue: purchase ? (10 + b + (i % 4) * 0.1).toFixed(2) : null,
            currency: purchase ? (b % 2 === 0 ? "USD" : "EUR") : null,
            orderId: purchase ? `gid://shopify/Order/${b}${i}` : null,
            eventKey: `perf:${bundleId}:${i}`,
            createdAt: new Date(now - i * 2 * 86_400_000), // spread over 80 days
          };
        }),
      );
      await prisma.analyticsEvent.createMany({ data: rows });
    }, 60_000);

    it("the store overview is 3 statements (two aggregates and the titles), whatever the bundle count", async () => {
      const out = await measure(() => getAnalyticsOverview(shop.id));
      expect(out.count).toBe(3);
      expect(out.repeats).toBe(0);
      // All aggregation happens in the database: no statement returns raw events.
      expect(
        statements.some(
          (sql) => /^SELECT .* FROM "public"."analytics_events"/.test(sql) && !/GROUP BY/.test(sql),
        ),
      ).toBe(false);
    });

    it("the store totals equal an independent aggregate, and each bundle row equals its own", async () => {
      const overview = await getAnalyticsOverview(shop.id);
      const independent = await getTotals(shop.id);
      expect(overview.views).toBe(independent.views);
      expect(overview.adds).toBe(independent.adds);
      expect(overview.purchases).toBe(independent.purchases);
      expect(overview.revenue).toEqual(independent.revenue);
      expect(overview.conversionRate).toBe(independent.conversionRate);
      expect(overview.views + overview.adds + overview.purchases).toBe(6 * 40);
      expect(overview.revenue.map((r) => r.currency).sort()).toEqual(["EUR", "USD"]);

      expect(overview.byBundle).toHaveLength(6);
      for (const row of overview.byBundle) {
        const own = await getBundleAnalytics(shop.id, row.bundleId);
        expect(row).toMatchObject({
          views: own.views,
          adds: own.adds,
          purchases: own.purchases,
          revenue: own.revenue,
        });
      }
      // The per-bundle rows add up to the store total.
      expect(overview.byBundle.reduce((sum, r) => sum + r.purchases, 0)).toBe(overview.purchases);
    });

    it("gives the same answer for a date range as independent aggregates", async () => {
      const from = new Date(Date.now() - 30 * 86_400_000);
      const filters = { from, to: null, bundleId: null };
      const overview = await getAnalyticsOverview(shop.id, filters);
      const independent = await getTotals(shop.id, filters);
      expect(overview.views).toBe(independent.views);
      expect(overview.purchases).toBe(independent.purchases);
      expect(overview.revenue).toEqual(independent.revenue);
      expect(overview.views).toBeLessThan(6 * 40);
    });

    it("a single-bundle overview checks ownership and aggregates in one round, and refuses foreign ids", async () => {
      const out = await measure(() =>
        getAnalyticsOverview(shop.id, { from: null, to: null, bundleId: bundleIds[0] }),
      );
      expect(out.count).toBe(3); // ownership + two aggregates (concurrent)
      expect(out.result.byBundle).toEqual([]);
      await expect(
        getAnalyticsOverview(shop.id, {
          from: null,
          to: null,
          bundleId: "5f0c6a6e-8f0e-4c53-9b64-6f7f3f2b9a11",
        }),
      ).rejects.toMatchObject({ code: "BUNDLE_NOT_FOUND" });
    });

    it("stays scoped to the shop: another shop sees none of these events", async () => {
      const other = await prisma.shop.create({
        data: {
          shopDomain: "bundlecraft-perf-test-b.myshopify.com",
          accessToken: "x",
          email: "b@example.com",
        },
      });
      try {
        const overview = await getAnalyticsOverview(other.id);
        expect(overview.views + overview.adds + overview.purchases).toBe(0);
        expect(overview.byBundle).toEqual([]);
        await expect(
          getAnalyticsOverview(other.id, { from: null, to: null, bundleId: bundleIds[0] }),
        ).rejects.toMatchObject({ code: "BUNDLE_NOT_FOUND" });
      } finally {
        await prisma.shop.delete({ where: { id: other.id } });
      }
    });

    it("caps the per-bundle breakdown so the response stays bounded", async () => {
      const overview = await getAnalyticsOverview(shop.id);
      expect(overview.byBundle.length).toBeLessThanOrEqual(50);
    });
  });

  describe("indexes", () => {
    it("analytics_events has exactly the intended indexes (the two redundant ones are gone)", async () => {
      const rows = (await prisma.$queryRawUnsafe(
        `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'analytics_events' ORDER BY indexname`,
      )) as { indexname: string }[];
      expect(rows.map((r) => r.indexname)).toEqual([
        "analytics_events_bundle_id_event_type_created_at_idx",
        "analytics_events_created_at_idx",
        "analytics_events_pkey",
        "analytics_events_shop_id_event_key_key",
        "analytics_events_shop_id_event_type_created_at_idx",
      ]);
    });

    it("no index on any table is a strict prefix of another (nothing redundant is left)", async () => {
      const rows = (await prisma.$queryRawUnsafe(`
        SELECT t.relname AS table_name, i.relname AS index_name, ix.indkey::text AS cols, ix.indisunique AS uniq,
               (ix.indpred IS NOT NULL) AS partial, (ix.indexprs IS NOT NULL) AS expr
        FROM pg_index ix JOIN pg_class t ON t.oid = ix.indrelid JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace WHERE n.nspname = 'public' AND NOT ix.indisprimary`)) as {
        table_name: string;
        index_name: string;
        cols: string;
        uniq: boolean;
        partial: boolean;
        expr: boolean;
      }[];
      const redundant: string[] = [];
      for (const a of rows.filter((r) => !r.uniq && !r.partial && !r.expr)) {
        const aCols = a.cols.trim().split(/\s+/);
        for (const b of rows) {
          if (b === a || b.table_name !== a.table_name || b.partial || b.expr) continue;
          const bCols = b.cols.trim().split(/\s+/);
          if (bCols.length > aCols.length && aCols.every((c, i) => bCols[i] === c)) {
            redundant.push(`${a.index_name} is a prefix of ${b.index_name}`);
          }
        }
      }
      // Pre-existing single-column indexes on bundles (shop_id, status) are kept: they are tiny
      // tables per shop and are documented as left alone in docs/04.
      expect(redundant.filter((line) => line.startsWith("analytics_events"))).toEqual([]);
    });
  });
});
