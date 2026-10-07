// @vitest-environment node
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { BundleDraftInput } from "@/lib/bundles/types";
import { parseShopifyProduct } from "@/lib/products/shopify";
import { parseProductQuery } from "@/lib/products/validation";
import { prisma } from "@/lib/prisma";
import { grantPlan } from "@/services/billing/testing";
import { createBundle } from "@/services/bundles/create";
import { getBundle } from "@/services/bundles/get";
import { listBundlesForShop } from "@/services/dashboard/bundles";
import { deactivateBundle, publishBundle } from "@/services/bundles/publish";
import { updateBundle } from "@/services/bundles/update";
import { getStorefrontBundles } from "@/services/storefront/bundles";
import { prepareBundleCart } from "@/services/storefront/cart";
import { getVariantInfo } from "@/services/storefront/product-info";
import { ShopifyPermissionError } from "@/services/shopify/products";
import { getCatalogStatus, getProduct, listProducts } from "./queries";
import { markProductDeleted, storeProducts } from "./store";
import { STALE_AFTER_MS, removeProduct, syncCatalog, syncProduct } from "./sync";
import { fakeCatalog } from "./test-instance";
import { rawProduct, seedCatalog } from "./testing";
import { checkCatalogProducts } from "./validate";

/**
 * Product & variant sync against the real database, with Shopify replaced by an in-memory
 * fake. Proves our sync, storage, validation and tenant rules, NOT that Shopify returns
 * what the fake returns (see services/shopify/products.test.ts and the live probe notes).
 */
vi.mock("@/services/products/gateway", async () => {
  const { fakeCatalog } = await import("@/services/products/test-instance");
  return { openCatalogGateway: async () => fakeCatalog };
});
vi.mock("@/services/discounts/gateway", async () => {
  const { fakeGateway } = await import("@/services/discounts/test-instance");
  return { openDiscountGateway: async () => fakeGateway };
});

const canRun = Boolean(process.env.DATABASE_URL);
const DOMAIN_A = "bundlecraft-catalog-a.myshopify.com";
const DOMAIN_B = "bundlecraft-catalog-b.myshopify.com";

async function apiError(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

describe.skipIf(!canRun)("product & variant sync (live database, fake Shopify)", () => {
  let shopA: string;
  let shopB: string;

  const productsOf = (shopId: string) =>
    prisma.product.findMany({
      where: { shopId },
      include: { variants: true },
      orderBy: { shopifyProductId: "asc" },
    });
  const one = (shopId: string, id: string) =>
    prisma.product.findUnique({
      where: { shopId_shopifyProductId: { shopId, shopifyProductId: id } },
      include: { variants: { orderBy: { position: "asc" } } },
    });
  const resetShop = async (shopId: string) => {
    await prisma.product.deleteMany({ where: { shopId } });
    await prisma.shop.update({
      where: { id: shopId },
      data: {
        catalogSyncStatus: "pending",
        catalogSyncCursor: null,
        catalogSyncStartedAt: null,
        catalogSyncedAt: null,
        catalogSyncError: null,
      },
    });
  };

  beforeAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    const make = async (shopDomain: string) =>
      (await prisma.shop.create({ data: { shopDomain, accessToken: "x", email: "c@example.com" } }))
        .id;
    shopA = await make(DOMAIN_A);
    shopB = await make(DOMAIN_B);
    await grantPlan(shopA, "pro");
    await grantPlan(shopB, "pro");
  });
  afterAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    fakeCatalog.reset();
    await resetShop(shopA);
    await resetShop(shopB);
  });

  describe("initial (full) sync", () => {
    it("imports products and their variants and records the sync state", async () => {
      fakeCatalog.set({
        id: 1,
        title: "Tee",
        variants: [
          { id: 11, title: "S" },
          { id: 12, title: "M", price: "21.50" },
        ],
      });
      fakeCatalog.set({ id: 2, title: "Cap", status: "DRAFT", vendor: null });

      const result = await syncCatalog(shopA);
      expect(result).toMatchObject({
        outcome: "synced",
        pages: 1,
        products: 2,
        variants: 3,
        skipped: 0,
        markedDeleted: 0,
      });

      const tee = await one(shopA, "1");
      expect(tee).toMatchObject({ title: "Tee", status: "active", vendor: "Acme" });
      expect(tee?.variants.map((v) => [v.shopifyVariantId, v.title, v.price?.toFixed(2)])).toEqual([
        ["11", "S", "19.00"],
        ["12", "M", "21.50"],
      ]);
      expect(await one(shopA, "2")).toMatchObject({ status: "draft", vendor: null });

      expect(await getCatalogStatus(shopA)).toMatchObject({ status: "synced", error: null });
      expect((await getCatalogStatus(shopA)).syncedAt).not.toBeNull();
    });

    it("pages through a catalog larger than one page, without missing or repeating products", async () => {
      for (let id = 1; id <= 7; id++)
        fakeCatalog.set({ id, variants: [{ id: id * 10 }, { id: id * 10 + 1 }] });
      fakeCatalog.pageSize = 3;

      const result = await syncCatalog(shopA);
      expect(result).toMatchObject({ outcome: "synced", pages: 3, products: 7, variants: 14 });
      expect((await productsOf(shopA)).map((p) => p.shopifyProductId)).toEqual([
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
      ]);
      expect(fakeCatalog.calls.filter((c) => c === "fetchProductsPage")).toHaveLength(3);
    });

    it("is idempotent: syncing the same catalog again creates no duplicates and keeps identities", async () => {
      fakeCatalog.set({ id: 1, variants: [{ id: 11 }, { id: 12 }] });
      fakeCatalog.set({ id: 2 });
      await syncCatalog(shopA);
      const first = await productsOf(shopA);
      await syncCatalog(shopA);
      await syncCatalog(shopA);

      const again = await productsOf(shopA);
      expect(again).toHaveLength(2);
      expect(again.flatMap((p) => p.variants)).toHaveLength(3);
      expect(again.map((p) => p.id)).toEqual(first.map((p) => p.id)); // same rows, updated in place
    });

    it("an empty catalog completes cleanly", async () => {
      expect(await syncCatalog(shopA)).toMatchObject({ outcome: "synced", pages: 1, products: 0 });
      expect(await getCatalogStatus(shopA)).toMatchObject({ status: "synced" });
    });

    it("skips (and counts) a product that fails validation, and stores the rest", async () => {
      fakeCatalog.set({ id: 1 });
      fakeCatalog.products.set("gid://shopify/Product/2", {
        id: "gid://shopify/Product/2",
        title: 5,
      });
      fakeCatalog.set({ id: 3 });
      const result = await syncCatalog(shopA);
      expect(result).toMatchObject({ outcome: "synced", products: 2, skipped: 1 });
      expect((await productsOf(shopA)).map((p) => p.shopifyProductId)).toEqual(["1", "3"]);
    });

    it("handles a large catalog in batches (one statement set per page, not per variant)", async () => {
      for (let id = 1; id <= 200; id++) {
        fakeCatalog.set({
          id,
          variants: [{ id: id * 10 }, { id: id * 10 + 1 }, { id: id * 10 + 2 }],
        });
      }
      fakeCatalog.pageSize = 50;
      const started = Date.now();
      const result = await syncCatalog(shopA, { budgetMs: 120_000 });
      const elapsed = Date.now() - started;

      expect(result).toMatchObject({ outcome: "synced", pages: 4, products: 200, variants: 600 });
      expect(await prisma.productVariant.count({ where: { shopId: shopA } })).toBe(600);
      expect(elapsed).toBeLessThan(60_000); // 4 pages x ~4 statements over the remote database
    });
  });

  describe("updates, removals and availability", () => {
    it("picks up title, price, sku, image and availability changes, and restores availability", async () => {
      fakeCatalog.set({
        id: 1,
        title: "Old",
        updatedAt: "2026-09-01T10:00:00Z",
        variants: [{ id: 11, title: "S", price: "10.00", sku: "A", availableForSale: false }],
      });
      await syncCatalog(shopA);
      fakeCatalog.set({
        id: 1,
        title: "New",
        updatedAt: "2026-09-02T10:00:00Z",
        variants: [
          {
            id: 11,
            title: "Small",
            price: "12.50",
            sku: "B",
            availableForSale: true,
            image: "https://cdn.shopify.com/v.png",
          },
        ],
      });
      await syncCatalog(shopA);

      const row = await one(shopA, "1");
      expect(row?.title).toBe("New");
      expect(row?.variants[0]).toMatchObject({
        title: "Small",
        sku: "B",
        availableForSale: true,
        imageUrl: "https://cdn.shopify.com/v.png",
      });
      expect(row?.variants[0].price?.toFixed(2)).toBe("12.50");
    });

    it("keeps a variant Shopify stopped listing as removed and unavailable, and revives it if it returns", async () => {
      fakeCatalog.set({ id: 1, variants: [{ id: 11 }, { id: 12 }] });
      await syncCatalog(shopA);
      fakeCatalog.set({ id: 1, updatedAt: "2026-09-02T10:00:00Z", variants: [{ id: 11 }] });
      await syncCatalog(shopA);

      let variants = (await one(shopA, "1"))?.variants ?? [];
      const gone = variants.find((v) => v.shopifyVariantId === "12");
      expect(gone?.removedAt).not.toBeNull();
      expect(gone?.availableForSale).toBe(false);
      expect(variants.find((v) => v.shopifyVariantId === "11")?.removedAt).toBeNull();

      fakeCatalog.set({
        id: 1,
        updatedAt: "2026-09-03T10:00:00Z",
        variants: [{ id: 11 }, { id: 12 }],
      });
      await syncCatalog(shopA);
      variants = (await one(shopA, "1"))?.variants ?? [];
      expect(variants.find((v) => v.shopifyVariantId === "12")).toMatchObject({
        removedAt: null,
        availableForSale: true,
      });
    });

    it("marks products that vanished from Shopify as deleted (kept, not removed) after a complete sync", async () => {
      fakeCatalog.set({ id: 1 });
      fakeCatalog.set({ id: 2 });
      await syncCatalog(shopA);
      fakeCatalog.remove(2);
      const result = await syncCatalog(shopA);

      expect(result.markedDeleted).toBe(1);
      expect(await one(shopA, "2")).toMatchObject({ status: "deleted" });
      expect((await one(shopA, "2"))?.variants).toHaveLength(1);
      expect(await one(shopA, "1")).toMatchObject({ status: "active" });
    });

    it("a stale copy never overwrites newer data, and a deleted product is never revived", async () => {
      const fresh = parseShopifyProduct(
        rawProduct({ id: 1, title: "Fresh", updatedAt: "2026-09-05T10:00:00Z" }),
      )!;
      const old = parseShopifyProduct(
        rawProduct({ id: 1, title: "Old", updatedAt: "2026-09-01T10:00:00Z" }),
      )!;
      await storeProducts(shopA, [fresh], new Date());
      const stale = await storeProducts(shopA, [old], new Date());
      expect(stale).toMatchObject({ written: 0, skipped: 1 });
      expect((await one(shopA, "1"))?.title).toBe("Fresh");

      await markProductDeleted(shopA, "1", new Date());
      const revive = await storeProducts(
        shopA,
        [parseShopifyProduct(rawProduct({ id: 1, updatedAt: "2030-01-01T00:00:00Z" }))!],
        new Date(),
      );
      expect(revive.written).toBe(0);
      expect(await one(shopA, "1")).toMatchObject({ status: "deleted" });
    });

    it("the same product twice in one batch is stored once (latest wins)", async () => {
      const a = parseShopifyProduct(
        rawProduct({ id: 1, title: "A", updatedAt: "2026-09-01T10:00:00Z" }),
      )!;
      const b = parseShopifyProduct(
        rawProduct({ id: 1, title: "B", updatedAt: "2026-09-02T10:00:00Z" }),
      )!;
      await storeProducts(shopA, [b, a], new Date());
      expect(await prisma.product.count({ where: { shopId: shopA } })).toBe(1);
      expect((await one(shopA, "1"))?.title).toBe("B");
    });
  });

  describe("single product sync (webhook path)", () => {
    it("creates, updates and deletes from Shopify's authoritative answer", async () => {
      fakeCatalog.set({ id: 1, title: "Tee", variants: [{ id: 11 }] });
      expect(await syncProduct(shopA, "gid://shopify/Product/1")).toEqual({
        result: "synced",
        variants: 1,
      });

      fakeCatalog.set({
        id: 1,
        title: "Tee 2",
        updatedAt: "2026-09-02T10:00:00Z",
        variants: [{ id: 11 }, { id: 12 }],
      });
      expect(await syncProduct(shopA, "gid://shopify/Product/1")).toEqual({
        result: "synced",
        variants: 2,
      });
      expect((await one(shopA, "1"))?.title).toBe("Tee 2");

      fakeCatalog.remove(1);
      expect(await syncProduct(shopA, "gid://shopify/Product/1")).toEqual({
        result: "deleted",
        variants: 0,
      });
      expect(await one(shopA, "1")).toMatchObject({ status: "deleted" });
    });

    it("repeating it is harmless, and an unchanged product is reported as such after deletion", async () => {
      fakeCatalog.set({ id: 1 });
      await syncProduct(shopA, "gid://shopify/Product/1");
      await syncProduct(shopA, "gid://shopify/Product/1");
      expect(await prisma.product.count({ where: { shopId: shopA } })).toBe(1);
      expect(await prisma.productVariant.count({ where: { shopId: shopA } })).toBe(1);

      expect((await removeProduct(shopA, "1")).changed).toBe(true);
      expect((await removeProduct(shopA, "1")).changed).toBe(false);
    });

    it("refuses an unusable Shopify answer rather than guessing", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      fakeCatalog.products.set("gid://shopify/Product/1", {
        id: "gid://shopify/Product/1",
        nope: true,
      });
      expect(await apiError(syncProduct(shopA, "gid://shopify/Product/1"))).toMatchObject({
        code: "SHOPIFY_API_ERROR",
        status: 502,
      });
      expect(await one(shopA, "1")).toBeNull();
    });

    it("a Shopify outage is a safe 502 and stores nothing", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      fakeCatalog.set({ id: 1 });
      fakeCatalog.failNext("fetchProduct", new Error("boom shpat_secret"));
      const error = await apiError(syncProduct(shopA, "gid://shopify/Product/1"));
      expect(error).toMatchObject({ code: "SHOPIFY_API_ERROR" });
      expect(error.message).not.toMatch(/boom|shpat/);
      expect(await one(shopA, "1")).toBeNull();
    });
  });

  describe("races and failures", () => {
    it("a webhook that lands mid-sync survives the sync's clean-up of vanished products", async () => {
      fakeCatalog.set({ id: 1 });
      await syncCatalog(shopA);
      // Product 9 was created in Shopify AFTER the listing began (so it is not in the listing).
      fakeCatalog.beforeNextRead(async () => {
        await storeProducts(shopA, [parseShopifyProduct(rawProduct({ id: 9 }))!], new Date());
      });
      // Product 5 is old local data that Shopify really no longer has.
      await storeProducts(
        shopA,
        [parseShopifyProduct(rawProduct({ id: 5 }))!],
        new Date(Date.now() - 3_600_000),
      );

      await syncCatalog(shopA);
      expect(await one(shopA, "9")).toMatchObject({ status: "active" });
      expect(await one(shopA, "5")).toMatchObject({ status: "deleted" });
    });

    it("a product deleted while the sync is running stays deleted", async () => {
      fakeCatalog.set({ id: 1 });
      fakeCatalog.set({ id: 2 });
      await syncCatalog(shopA);
      fakeCatalog.beforeNextRead(async () => {
        await removeProduct(shopA, "2"); // the delete webhook wins the race; the page still lists it
      });
      await syncCatalog(shopA);
      expect(await one(shopA, "2")).toMatchObject({ status: "deleted" });
      expect(await one(shopA, "1")).toMatchObject({ status: "active" });
    });

    it("two syncs at once: the second is told one is already running, and the data is consistent", async () => {
      for (let id = 1; id <= 5; id++) fakeCatalog.set({ id });
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => (release = resolve));
      fakeCatalog.beforeNextRead(() => gate);

      const first = syncCatalog(shopA);
      await vi.waitFor(async () => {
        expect((await getCatalogStatus(shopA)).status).toBe("syncing");
      });
      const second = await syncCatalog(shopA);
      expect(second.outcome).toBe("already_running");
      release();
      expect((await first).outcome).toBe("synced");
      expect(await prisma.product.count({ where: { shopId: shopA } })).toBe(5);
    });

    it("a run that died is reclaimed after the stale timeout", async () => {
      fakeCatalog.set({ id: 1 });
      await prisma.shop.update({ where: { id: shopA }, data: { catalogSyncStatus: "syncing" } });
      expect((await syncCatalog(shopA)).outcome).toBe("already_running");

      const old = new Date(Date.now() - STALE_AFTER_MS - 60_000);
      await prisma.$executeRaw`UPDATE shops SET updated_at = ${old} WHERE id = ${shopA}::uuid`;
      expect((await syncCatalog(shopA)).outcome).toBe("synced");
    });

    it("stops at the time budget with a saved cursor, and the next call resumes without redoing pages", async () => {
      for (let id = 1; id <= 6; id++) fakeCatalog.set({ id });
      fakeCatalog.pageSize = 2;

      const first = await syncCatalog(shopA, { budgetMs: 0 });
      expect(first).toMatchObject({ outcome: "partial", pages: 1, products: 2 });
      const mid = await prisma.shop.findUniqueOrThrow({ where: { id: shopA } });
      expect(mid).toMatchObject({ catalogSyncStatus: "partial" });
      expect(mid.catalogSyncCursor).not.toBeNull();

      const pagesBefore = fakeCatalog.calls.length;
      const second = await syncCatalog(shopA, { budgetMs: 60_000 });
      expect(second).toMatchObject({ outcome: "synced", pages: 2, products: 4 });
      expect(fakeCatalog.calls.length - pagesBefore).toBe(2); // resumed, did not restart
      expect(await prisma.product.count({ where: { shopId: shopA, status: "active" } })).toBe(6);
      expect(
        (await prisma.shop.findUniqueOrThrow({ where: { id: shopA } })).catalogSyncCursor,
      ).toBeNull();
    });

    it("a partial run does not delete anything: only a complete sync clears vanished products", async () => {
      fakeCatalog.set({ id: 1 });
      fakeCatalog.set({ id: 2 });
      fakeCatalog.set({ id: 3 });
      await syncCatalog(shopA);
      fakeCatalog.remove(3);
      fakeCatalog.pageSize = 1;
      await syncCatalog(shopA, { budgetMs: 0 });
      expect(await one(shopA, "3")).toMatchObject({ status: "active" });
      await syncCatalog(shopA, { budgetMs: 60_000 });
      expect(await one(shopA, "3")).toMatchObject({ status: "deleted" });
    });

    it("a Shopify failure marks the sync failed with a short code, keeps completed pages, and can be retried", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      for (let id = 1; id <= 4; id++) fakeCatalog.set({ id });
      fakeCatalog.pageSize = 2;
      fakeCatalog.failNext("fetchProductsPage", new ShopifyPermissionError("denied shpat_secret"));

      const error = await apiError(syncCatalog(shopA));
      expect(error).toMatchObject({ code: "SHOPIFY_API_ERROR", status: 502 });
      const state = await getCatalogStatus(shopA);
      expect(state).toMatchObject({ status: "failed", error: "SHOPIFY_PERMISSION" });
      expect(JSON.stringify(state)).not.toMatch(/shpat|denied/);

      expect((await syncCatalog(shopA)).outcome).toBe("synced");
      expect(await prisma.product.count({ where: { shopId: shopA } })).toBe(4);
      expect(await getCatalogStatus(shopA)).toMatchObject({ status: "synced", error: null });
    });

    it("a failure on a later page keeps the earlier pages and resumes from the cursor", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      for (let id = 1; id <= 4; id++) fakeCatalog.set({ id });
      fakeCatalog.pageSize = 2;
      await syncCatalog(shopA, { budgetMs: 0 }); // page 1 stored, cursor saved
      fakeCatalog.failNext("fetchProductsPage");
      await apiError(syncCatalog(shopA));
      expect(await prisma.product.count({ where: { shopId: shopA } })).toBe(2);

      const pagesBefore = fakeCatalog.calls.length;
      const result = await syncCatalog(shopA);
      expect(result).toMatchObject({ outcome: "synced", products: 2 });
      expect(fakeCatalog.calls.length - pagesBefore).toBe(1);
    });

    it("refuses to sync for a shop that is not active", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      await prisma.shop.update({ where: { id: shopB }, data: { status: "inactive" } });
      expect(await apiError(syncCatalog(shopB))).toMatchObject({ code: "SHOPIFY_API_ERROR" });
      await prisma.shop.update({ where: { id: shopB }, data: { status: "active" } });
    });
  });

  describe("tenant isolation", () => {
    it("the same Shopify ids in two shops are separate rows, and one shop's sync never touches the other", async () => {
      fakeCatalog.set({ id: 1, title: "Shared id", variants: [{ id: 11 }] });
      await syncCatalog(shopA);
      await syncCatalog(shopB);
      fakeCatalog.set({
        id: 1,
        title: "A only",
        updatedAt: "2026-09-02T10:00:00Z",
        variants: [{ id: 11 }],
      });
      await syncCatalog(shopA);

      expect((await one(shopA, "1"))?.title).toBe("A only");
      expect((await one(shopB, "1"))?.title).toBe("Shared id");
      expect(
        await prisma.product.count({
          where: { shopifyProductId: "1", shopId: { in: [shopA, shopB] } },
        }),
      ).toBe(2);
      expect(
        await prisma.productVariant.count({
          where: { shopifyVariantId: "11", shopId: { in: [shopA, shopB] } },
        }),
      ).toBe(2);
      expect((await getCatalogStatus(shopB)).status).toBe("synced");
    });

    it("deleting a product in one shop leaves the other's untouched", async () => {
      await seedCatalog(shopA, [{ productId: "50", variantId: "500" }]);
      await seedCatalog(shopB, [{ productId: "50", variantId: "500" }]);
      await removeProduct(shopA, "50");
      expect(await one(shopA, "50")).toMatchObject({ status: "deleted" });
      expect(await one(shopB, "50")).toMatchObject({ status: "active" });
    });
  });

  describe("product queries", () => {
    beforeEach(async () => {
      fakeCatalog.set({
        id: 1,
        title: "Alpha Shirt",
        vendor: "Acme",
        productType: "Shirt",
        variants: [{ id: 11 }, { id: 12, availableForSale: false }],
      });
      fakeCatalog.set({
        id: 2,
        title: "Beta Shirt",
        vendor: "Zed",
        productType: "Shirt",
        status: "DRAFT",
        variants: [{ id: 21 }],
      });
      fakeCatalog.set({
        id: 3,
        title: "Gamma Cap",
        vendor: "Acme",
        productType: "Hat",
        variants: [{ id: 31, availableForSale: false }],
      });
      fakeCatalog.set({ id: 4, title: "Delta Sock", variants: [{ id: 41 }] });
      await syncCatalog(shopA);
      fakeCatalog.remove(4);
      await syncCatalog(shopA);
      await seedCatalog(shopB, [
        { productId: "99", variantId: "990", title: "Other Shop Product" },
      ]);
    });

    const list = (query: string) =>
      listProducts(shopA, parseProductQuery(new URLSearchParams(query)));

    it("lists the shop's products alphabetically with availability, and never deleted ones", async () => {
      const result = await list("");
      expect(result.items.map((p) => p.title)).toEqual(["Alpha Shirt", "Beta Shirt", "Gamma Cap"]);
      expect(result).toMatchObject({ total: 3, page: 1, limit: 20 });
      expect(result.catalog.status).toBe("synced");
      const [alpha, beta, gamma] = result.items;
      expect(alpha).toMatchObject({ variantCount: 2, availableVariantCount: 1, available: true });
      expect(beta).toMatchObject({ status: "draft", available: false }); // draft product is not buyable
      expect(gamma).toMatchObject({ variantCount: 1, availableVariantCount: 0, available: false }); // all sold out
      expect(JSON.stringify(result)).not.toMatch(/shopId|syncedAt.*\d{4}.*shop|accessToken/);
    });

    it("paginates with a stable order and a correct total", async () => {
      const first = await list("limit=2&page=1");
      const second = await list("limit=2&page=2");
      const third = await list("limit=2&page=3");
      expect(first.items.map((p) => p.title)).toEqual(["Alpha Shirt", "Beta Shirt"]);
      expect(second.items.map((p) => p.title)).toEqual(["Gamma Cap"]);
      expect(third.items).toEqual([]);
      expect([first.total, second.total, third.total]).toEqual([3, 3, 3]);
    });

    it("filters by search (title and handle, any case), status, vendor and type", async () => {
      expect((await list("search=SHIRT")).items.map((p) => p.title)).toEqual([
        "Alpha Shirt",
        "Beta Shirt",
      ]);
      expect((await list("search=product-3")).items.map((p) => p.title)).toEqual(["Gamma Cap"]);
      expect((await list("status=draft")).items.map((p) => p.title)).toEqual(["Beta Shirt"]);
      expect((await list("vendor=acme")).items.map((p) => p.title)).toEqual([
        "Alpha Shirt",
        "Gamma Cap",
      ]);
      expect((await list("productType=hat")).items.map((p) => p.title)).toEqual(["Gamma Cap"]);
      expect((await list("search=shirt&vendor=Acme")).items.map((p) => p.title)).toEqual([
        "Alpha Shirt",
      ]);
      expect((await list("search=nothing-matches")).items).toEqual([]);
    });

    it("treats search text as data: no injection through filters", async () => {
      for (const search of ["' OR 1=1 --", "%", "_", "\\", "<script>alert(1)</script>"]) {
        const result = await list(`search=${encodeURIComponent(search)}`);
        expect(result.items).toEqual([]);
      }
    });

    it("wildcard characters in filters are literal: % and _ match only themselves", async () => {
      await seedCatalog(shopA, [
        { productId: "60", variantId: "600", title: "50% Off_Sale" },
        { productId: "61", variantId: "610", title: "50 Xoff Sale" },
      ]);
      expect((await list(`search=${encodeURIComponent("50%")}`)).items.map((p) => p.title)).toEqual(
        ["50% Off_Sale"],
      );
      expect(
        (await list(`search=${encodeURIComponent("Off_Sale")}`)).items.map((p) => p.title),
      ).toEqual(["50% Off_Sale"]);
      expect((await list(`vendor=${encodeURIComponent("Ac_e")}`)).items).toEqual([]);
      expect((await list(`vendor=${encodeURIComponent("%")}`)).items).toEqual([]);
      expect((await list(`productType=${encodeURIComponent("S_irt")}`)).items).toEqual([]);
    });

    it("uses a fixed number of queries however many products a page has (no N+1)", async () => {
      const findMany = vi.spyOn(prisma.product, "findMany");
      const groupBy = vi.spyOn(prisma.productVariant, "groupBy");
      const variantFindMany = vi.spyOn(prisma.productVariant, "findMany");
      await list("limit=50");
      expect(findMany).toHaveBeenCalledTimes(1);
      expect(groupBy).toHaveBeenCalledTimes(1);
      expect(variantFindMany).not.toHaveBeenCalled();
    });

    it("returns one product with only its non-removed variants, in order", async () => {
      const alpha = (await list("search=alpha")).items[0];
      const detail = await getProduct(shopA, alpha.id);
      expect(detail.variants.map((v) => [v.shopifyVariantId, v.availableForSale])).toEqual([
        ["11", true],
        ["12", false],
      ]);
      expect(detail.variants[0]).toMatchObject({ price: "19.00", sku: null });
    });

    it("another shop's product, a deleted product and an unknown id are all a plain 404", async () => {
      const other = await prisma.product.findFirstOrThrow({ where: { shopId: shopB } });
      const deleted = await prisma.product.findFirstOrThrow({
        where: { shopId: shopA, status: "deleted" },
      });
      for (const id of [other.id, deleted.id, randomUUID()]) {
        expect(await apiError(getProduct(shopA, id))).toMatchObject({
          code: "PRODUCT_NOT_FOUND",
          status: 404,
        });
      }
    });

    it("never lists another shop's products", async () => {
      const titles = (await list("limit=50")).items.map((p) => p.title);
      expect(titles).not.toContain("Other Shop Product");
      expect(
        (await listProducts(shopB, parseProductQuery(new URLSearchParams("")))).items.map(
          (p) => p.title,
        ),
      ).toEqual(["Other Shop Product"]);
    });
  });

  describe("bundle integration", () => {
    const draft = (products: BundleDraftInput["products"]): BundleDraftInput => ({
      title: "Bundle",
      description: null,
      bundleType: "fixed",
      templateId: null,
      requiredQuantity: null,
      discountType: "percentage",
      discountValue: 20,
      products,
      customization: null,
    });
    const ref = (productId: string, variantId: string, quantity = 1) => ({
      shopifyProductId: productId,
      shopifyVariantId: variantId,
      quantity,
    });

    beforeEach(async () => {
      await prisma.bundle.deleteMany({ where: { shopId: { in: [shopA, shopB] } } });
      await seedCatalog(shopA, [
        { productId: "1", variantId: "11" },
        { productId: "2", variantId: "21", title: "Sold Out Tee", available: false },
        { productId: "3", variantId: "31", status: "archived", title: "Archived Hat" },
        { productId: "4", variantId: "41", status: "deleted", title: "Deleted Cap" },
      ]);
      await seedCatalog(shopB, [{ productId: "77", variantId: "770" }]);
    });

    it("saving accepts this shop's products (numeric or gid ids) and refuses unknown ones", async () => {
      expect(
        await checkCatalogProducts(shopA, [ref("1", "11")], { requireBuyable: false }),
      ).toEqual([]);
      expect(
        await checkCatalogProducts(
          shopA,
          [ref("gid://shopify/Product/1", "gid://shopify/ProductVariant/11")],
          { requireBuyable: false },
        ),
      ).toEqual([]);
      const issues = await checkCatalogProducts(shopA, [ref("1", "11"), ref("999", "9990")], {
        requireBuyable: false,
      });
      expect(issues).toEqual([
        expect.objectContaining({
          field: "products[1].shopifyVariantId",
          code: "PRODUCT_NOT_FOUND",
        }),
      ]);
    });

    it("another shop's ids fail exactly like made-up ones (no probing across tenants)", async () => {
      const cross = await checkCatalogProducts(shopA, [ref("77", "770")], {
        requireBuyable: false,
      });
      const madeUp = await checkCatalogProducts(shopA, [ref("888", "8880")], {
        requireBuyable: false,
      });
      expect(cross).toEqual(madeUp.map((i) => ({ ...i })));
      expect(cross[0].code).toBe("PRODUCT_NOT_FOUND");
      expect(JSON.stringify(cross)).not.toMatch(/Other|shopB|770/);
    });

    it("a variant paired with the wrong product is refused", async () => {
      await seedCatalog(shopA, [{ productId: "5", variantId: "51" }]);
      const issues = await checkCatalogProducts(shopA, [ref("1", "51")], { requireBuyable: false });
      expect(issues[0]?.code).toBe("PRODUCT_NOT_FOUND");
    });

    it("creating through the merchant path (verifyCatalog) rejects cross-shop and unknown products with 422 details, storing nothing", async () => {
      for (const bad of [ref("77", "770"), ref("999", "9990")]) {
        const error = await apiError(
          createBundle(shopA, draft([ref("1", "11"), bad]), { verifyCatalog: true }),
        );
        expect(error).toMatchObject({ code: "VALIDATION_ERROR", status: 422 });
        expect(error.details?.[0]).toMatchObject({
          field: "products[1].shopifyVariantId",
          code: "PRODUCT_NOT_FOUND",
        });
      }
      expect(await prisma.bundle.count({ where: { shopId: shopA } })).toBe(0);
      const ok = await createBundle(shopA, draft([ref("1", "11")]), { verifyCatalog: true });
      expect(ok.products).toHaveLength(1);
    });

    it("updating products through the merchant path is verified too, and leaves the bundle unchanged on failure", async () => {
      const bundle = await createBundle(shopA, draft([ref("1", "11")]), { verifyCatalog: true });
      await apiError(
        updateBundle(shopA, bundle.id, { products: [ref("77", "770")] }, { verifyCatalog: true }),
      );
      expect((await getBundle(shopA, bundle.id)).products.map((p) => p.shopifyVariantId)).toEqual([
        "11",
      ]);
      await updateBundle(shopA, bundle.id, { title: "Renamed" }, { verifyCatalog: true }); // no products in patch: nothing to verify
    });

    it("publishing requires every product to be live: deleted, archived and unknown products are refused", async () => {
      for (const [product, expected] of [
        [ref("4", "41"), "PRODUCT_UNAVAILABLE"],
        [ref("3", "31"), "PRODUCT_UNAVAILABLE"],
      ] as const) {
        const bundle = await createBundle(shopA, draft([ref("1", "11"), product]));
        const error = await apiError(publishBundle(shopA, bundle.id));
        expect(error).toMatchObject({ code: "BUNDLE_CANNOT_BE_PUBLISHED", status: 422 });
        expect(error.details?.[0]).toMatchObject({
          field: "products[1].shopifyVariantId",
          code: expected,
        });
        expect((await getBundle(shopA, bundle.id)).status).toBe("draft");
      }
      const unknown = await createBundle(shopA, draft([ref("999", "9990")]));
      expect((await apiError(publishBundle(shopA, unknown.id))).details?.[0].code).toBe(
        "PRODUCT_NOT_FOUND",
      );
      const crossShop = await createBundle(shopA, draft([ref("77", "770")]));
      expect((await apiError(publishBundle(shopA, crossShop.id))).details?.[0].code).toBe(
        "PRODUCT_NOT_FOUND",
      );
    });

    it("a sold-out variant does not block publishing (stock is temporary)", async () => {
      const bundle = await createBundle(shopA, draft([ref("1", "11"), ref("2", "21")]));
      expect((await publishBundle(shopA, bundle.id)).status).toBe("active");
    });

    it("a product removed from Shopify never changes or deletes an active bundle; the state is exposed instead", async () => {
      const bundle = await createBundle(shopA, draft([ref("1", "11"), ref("2", "21")]));
      await publishBundle(shopA, bundle.id);
      await removeProduct(shopA, "1");

      const after = await getBundle(shopA, bundle.id);
      expect(after.status).toBe("active"); // untouched
      expect(after.products).toHaveLength(2);
      expect(after.products.map((p) => [p.shopifyVariantId, p.catalog?.availability])).toEqual([
        ["11", "unavailable"],
        ["21", "sold_out"],
      ]);
      expect(after.products[1].catalog).toMatchObject({
        productTitle: "Sold Out Tee",
        variantTitle: "Default",
        price: "10.00",
      });

      // ...and it can no longer be re-published until the merchant fixes it.
      await deactivateBundle(shopA, bundle.id);
      expect((await apiError(publishBundle(shopA, bundle.id))).details?.[0].code).toBe(
        "PRODUCT_UNAVAILABLE",
      );
    });

    it("the bundle list counts products that are gone or unknown, per bundle, in one pass", async () => {
      const healthy = await createBundle(shopA, draft([ref("1", "11")]));
      const broken = await createBundle(
        shopA,
        draft([ref("4", "41"), ref("999", "9990"), ref("2", "21")]),
      );
      const items = await listBundlesForShop(shopA);
      expect(items.find((b) => b.id === healthy.id)?.productIssues).toBe(0);
      expect(items.find((b) => b.id === broken.id)?.productIssues).toBe(2); // deleted + unknown; sold out is not an issue
    });

    it("historical analytics stay readable after a product is deleted", async () => {
      const bundle = await createBundle(shopA, draft([ref("1", "11")]));
      await prisma.analyticsEvent.create({
        data: {
          shopId: shopA,
          bundleId: bundle.id,
          eventType: "bundle_purchase",
          revenue: 40,
          currency: "USD",
          eventKey: randomUUID(),
        },
      });
      await removeProduct(shopA, "1");
      expect(await prisma.analyticsEvent.count({ where: { bundleId: bundle.id } })).toBe(1);
      expect(await prisma.bundle.count({ where: { id: bundle.id } })).toBe(1);
    });

    it("bundle products for a foreign or unknown catalog entry read as unknown, not as another shop's data", async () => {
      const bundle = await createBundle(shopA, draft([ref("77", "770")]));
      const read = await getBundle(shopA, bundle.id);
      expect(read.products[0].catalog).toEqual({
        availability: "unknown",
        productTitle: null,
        variantTitle: null,
        imageUrl: null,
        price: null,
      });
    });
  });

  describe("storefront reads the synced catalog", () => {
    const shop = () => ({ id: shopA, shopDomain: DOMAIN_A });

    beforeEach(async () => {
      await prisma.bundle.deleteMany({ where: { shopId: { in: [shopA, shopB] } } });
      fakeCatalog.set({
        id: 1,
        title: "Linen Shirt",
        variants: [
          { id: 11, title: "S", price: "45.00" },
          { id: 12, title: "M", price: "45.00", availableForSale: false },
          { id: 13, title: "L", price: "47.00" },
        ],
      });
      fakeCatalog.set({ id: 2, title: "Cap", variants: [{ id: 21 }] });
      await syncCatalog(shopA);
    });

    it("resolves title, image, price and availability for a configured variant and its siblings, from one shop's data only", async () => {
      const info = await getVariantInfo(shop(), ["11", "gid://shopify/ProductVariant/21"]);
      expect(info.get("11")).toEqual({
        variantId: "11",
        productTitle: "Linen Shirt",
        imageUrl: "https://cdn.shopify.com/p.png",
        variants: [
          { id: "11", title: "S", price: "45.00", available: true },
          { id: "12", title: "M", price: "45.00", available: false },
          { id: "13", title: "L", price: "47.00", available: true },
        ],
      });
      expect(info.get("21")?.productTitle).toBe("Cap");
    });

    it("does not resolve another shop's variants, or variants that were never synced", async () => {
      await seedCatalog(shopB, [{ productId: "88", variantId: "880" }]);
      expect((await getVariantInfo(shop(), ["880", "424242"])).size).toBe(0);
      expect((await getVariantInfo({ id: shopB }, ["11"])).size).toBe(0);
    });

    it("uses ONE joined query however many variants are asked for", async () => {
      const spy = vi.spyOn(prisma.productVariant, "findMany");
      await getVariantInfo(shop(), ["11", "12", "13", "21"]);
      expect(spy).toHaveBeenCalledTimes(1);
      // ...and it is a single joined statement, not a query per relation.
      expect(spy.mock.calls[0][0]).toMatchObject({ relationLoadStrategy: "join" });
    });

    it("reports every variant of a deleted, draft or archived product as unavailable (never dropped)", async () => {
      await removeProduct(shopA, "1");
      const deleted = (await getVariantInfo(shop(), ["11"])).get("11");
      expect(deleted?.variants.map((v) => v.available)).toEqual([false, false, false]);

      fakeCatalog.set({
        id: 2,
        status: "ARCHIVED",
        updatedAt: "2026-09-09T10:00:00Z",
        variants: [{ id: 21 }],
      });
      await syncProduct(shopA, "gid://shopify/Product/2");
      expect((await getVariantInfo(shop(), ["21"])).get("21")?.variants[0].available).toBe(false);
    });

    it("keeps a variant Shopify removed visible as unavailable, so a bundle that names it shows sold out", async () => {
      fakeCatalog.set({ id: 2, updatedAt: "2026-09-09T10:00:00Z", variants: [{ id: 22 }] });
      await syncProduct(shopA, "gid://shopify/Product/2");
      const info = (await getVariantInfo(shop(), ["21"])).get("21");
      expect(info?.variants.find((v) => v.id === "21")?.available).toBe(false);
      expect(info?.variants.find((v) => v.id === "22")?.available).toBe(true);
    });

    async function activeBundle(products: [string, string][]) {
      const bundle = await createBundle(shopA, {
        title: "Store Bundle",
        description: null,
        bundleType: "fixed",
        templateId: null,
        requiredQuantity: null,
        discountType: "percentage",
        discountValue: 10,
        products: products.map(([p, v]) => ({
          shopifyProductId: p,
          shopifyVariantId: v,
          quantity: 1,
        })),
        customization: null,
      });
      await prisma.bundle.update({ where: { id: bundle.id }, data: { status: "active" } });
      return bundle.id;
    }

    it("the public bundle carries synced product data and per-variant availability", async () => {
      const id = await activeBundle([
        ["1", "11"],
        ["2", "21"],
      ]);
      const [bundle] = await getStorefrontBundles(shop(), { bundleId: id });
      expect(bundle.products[0]).toMatchObject({ title: "Linen Shirt", variantId: "11" });
      expect(bundle.products[0].variants.map((v) => v.available)).toEqual([true, false, true]);
      expect(bundle.products[1]).toMatchObject({ title: "Cap" });
      expect(JSON.stringify(bundle)).not.toMatch(/shopId|accessToken|syncedAt|removedAt/);
    });

    it("adding to cart works for available variants and refuses sold-out and deleted ones server-side", async () => {
      const id = await activeBundle([
        ["1", "11"],
        ["2", "21"],
      ]);
      const good = await prepareBundleCart(shop(), id, [
        { key: "11", variantId: "13", quantity: 1 },
        { key: "21", variantId: "21", quantity: 1 },
      ]);
      expect(good.items.map((i) => i.id)).toEqual([13, 21]);

      const soldOut = await apiError(
        prepareBundleCart(shop(), id, [
          { key: "11", variantId: "12", quantity: 1 },
          { key: "21", variantId: "21", quantity: 1 },
        ]),
      );
      expect(soldOut).toMatchObject({ status: 422 });

      await removeProduct(shopA, "2");
      const deleted = await apiError(
        prepareBundleCart(shop(), id, [
          { key: "11", variantId: "11", quantity: 1 },
          { key: "21", variantId: "21", quantity: 1 },
        ]),
      );
      expect(deleted).toMatchObject({ status: 422 });
    });
  });
});
