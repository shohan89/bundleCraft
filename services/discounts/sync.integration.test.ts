// @vitest-environment node
import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { BundleDraftInput } from "@/lib/bundles/types";
import { prisma } from "@/lib/prisma";
import { createBundleSeeded as createBundle } from "@/services/products/testing";
import { deleteBundle } from "@/services/bundles/delete";
import { getBundle } from "@/services/bundles/get";
import { deactivateBundle, publishBundle } from "@/services/bundles/publish";
import { updateBundle } from "@/services/bundles/update";
import { ShopifyAdminApiError } from "@/services/shopify/admin";
import { ShopifyPermissionError } from "@/services/shopify/discounts";
import { fakeGateway } from "./test-instance";
import { grantPlan } from "@/services/billing/testing";

// Shopify is never called: discount sync runs against an in-memory fake, so these tests prove
// our orchestration (ordering, idempotency, tenant scoping, failure handling) against a real
// database — not that Shopify accepts our GraphQL (see services/shopify/discounts.test.ts).
vi.mock("@/services/discounts/gateway", async () => {
  const { fakeGateway } = await import("@/services/discounts/test-instance");
  return { openDiscountGateway: async () => fakeGateway };
});

const canRun = Boolean(process.env.DATABASE_URL);
const DOMAIN_A = "bundlecraft-discount-test-a.myshopify.com";
const DOMAIN_B = "bundlecraft-discount-test-b.myshopify.com";

const input = (over: Partial<BundleDraftInput> = {}): BundleDraftInput => ({
  title: "Summer Outfit",
  description: null,
  bundleType: "fixed",
  templateId: null,
  requiredQuantity: null,
  discountType: "percentage",
  discountValue: 20,
  products: [
    { shopifyProductId: "1001", shopifyVariantId: "2001", quantity: 1 },
    { shopifyProductId: "gid://shopify/Product/1002", shopifyVariantId: "2002", quantity: 2 },
  ],
  customization: null,
  ...over,
});

async function apiError(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

const storedDiscount = async (bundleId: string) =>
  (await prisma.bundle.findUniqueOrThrow({ where: { id: bundleId } })).shopifyDiscountId;

describe.skipIf(!canRun)("Shopify discount sync (live database, fake Shopify)", () => {
  let shopA: string;
  let shopB: string;

  beforeAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    shopA = (
      await prisma.shop.create({
        data: { shopDomain: DOMAIN_A, accessToken: "test-a", email: "a@example.com" },
      })
    ).id;
    await grantPlan(shopA, "growth");
    shopB = (
      await prisma.shop.create({
        data: { shopDomain: DOMAIN_B, accessToken: "test-b", email: "b@example.com" },
      })
    ).id;
    await grantPlan(shopB, "growth");
  });

  afterAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    fakeGateway.reset();
  });

  describe("publish", () => {
    it("creates one active discount carrying the bundle's rules, and stores its id", async () => {
      const bundle = await createBundle(shopA, input());
      const published = await publishBundle(shopA, bundle.id);

      expect(published.status).toBe("active");
      const id = await storedDiscount(bundle.id);
      expect(id).toMatch(/^gid:\/\/shopify\/DiscountAutomaticNode\/\d+$/);
      expect(fakeGateway.discounts.size).toBe(1);
      expect(fakeGateway.discounts.get(id!)).toMatchObject({
        active: true,
        title: "Summer Outfit",
        config: {
          bundleId: bundle.id,
          type: "fixed",
          discount: { type: "percentage", value: 20 },
          currencyCode: "USD",
          rows: [
            { productId: "1001", variantId: "2001", quantity: 1 },
            { productId: "1002", variantId: "2002", quantity: 2 },
          ],
        },
      });
    });

    it("never exposes the Shopify discount id to the client", async () => {
      const bundle = await createBundle(shopA, input());
      const published = await publishBundle(shopA, bundle.id);
      const id = (await storedDiscount(bundle.id))!;
      expect(JSON.stringify(published)).not.toContain(id);
      expect(JSON.stringify(await getBundle(shopA, bundle.id))).not.toContain(id);
    });

    it("uses the shop's own currency for the config", async () => {
      fakeGateway.currency = "EUR";
      const bundle = await createBundle(
        shopA,
        input({ discountType: "fixed_amount", discountValue: 15 }),
      );
      await publishBundle(shopA, bundle.id);
      const [discount] = [...fakeGateway.discounts.values()];
      expect(discount.config).toMatchObject({
        discount: { type: "fixed_amount", value: 15 },
        currencyCode: "EUR",
      });
    });

    it("syncs each bundle type", async () => {
      for (const [bundleType, requiredQuantity] of [
        ["quantity", 3],
        ["mix_match", 2],
      ] as const) {
        const bundle = await createBundle(shopA, input({ bundleType, requiredQuantity }));
        await publishBundle(shopA, bundle.id);
        const id = (await storedDiscount(bundle.id))!;
        expect(fakeGateway.discounts.get(id)?.config).toMatchObject({
          type: bundleType,
          requiredQuantity,
        });
      }
    });

    it("is idempotent: deactivate + republish reuses the same discount and applies edits", async () => {
      const bundle = await createBundle(shopA, input());
      await publishBundle(shopA, bundle.id);
      const id = (await storedDiscount(bundle.id))!;

      await deactivateBundle(shopA, bundle.id);
      expect(fakeGateway.discounts.get(id)?.active).toBe(false);

      await updateBundle(shopA, bundle.id, { discountValue: 35, title: "Renamed" });
      await publishBundle(shopA, bundle.id);

      expect(await storedDiscount(bundle.id)).toBe(id);
      expect(fakeGateway.calls.filter((call) => call === "createDiscount")).toHaveLength(1);
      expect(fakeGateway.discounts.size).toBe(1);
      expect(fakeGateway.discounts.get(id)).toMatchObject({
        active: true,
        title: "Renamed",
        config: { discount: { value: 35 } },
      });
    });

    it("recreates the discount if the merchant deleted it in Shopify admin", async () => {
      const bundle = await createBundle(shopA, input());
      await publishBundle(shopA, bundle.id);
      const oldId = (await storedDiscount(bundle.id))!;
      await deactivateBundle(shopA, bundle.id);
      fakeGateway.discounts.delete(oldId);

      await publishBundle(shopA, bundle.id);
      const newId = (await storedDiscount(bundle.id))!;
      expect(newId).not.toBe(oldId);
      expect(fakeGateway.discounts.get(newId)?.active).toBe(true);
    });

    it("concurrent publishes leave exactly one active discount", async () => {
      const bundle = await createBundle(shopA, input());
      const results = await Promise.allSettled([
        publishBundle(shopA, bundle.id),
        publishBundle(shopA, bundle.id),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);

      const active = [...fakeGateway.discounts.values()].filter((d) => d.active);
      expect(fakeGateway.discounts.size).toBe(1);
      expect(active).toHaveLength(1);
      expect((await getBundle(shopA, bundle.id)).status).toBe("active");
    });

    it("does not publish when Shopify can't create the discount, and a retry then works", async () => {
      const bundle = await createBundle(shopA, input());
      fakeGateway.failNext("createDiscount");

      const error = await apiError(publishBundle(shopA, bundle.id));
      expect(error).toMatchObject({ code: "DISCOUNT_SYNC_FAILED", status: 502 });
      expect((await getBundle(shopA, bundle.id)).status).toBe("draft");
      expect(fakeGateway.discounts.size).toBe(0);

      expect((await publishBundle(shopA, bundle.id)).status).toBe("active");
      expect(fakeGateway.discounts.size).toBe(1);
    });

    it("asks the merchant to re-approve permissions when the scope is missing", async () => {
      const bundle = await createBundle(shopA, input());
      fakeGateway.failNext("fetchShopCurrency", new ShopifyPermissionError("denied"));
      const error = await apiError(publishBundle(shopA, bundle.id));
      expect(error).toMatchObject({ code: "DISCOUNT_PERMISSION_REQUIRED", status: 502 });
      expect((await getBundle(shopA, bundle.id)).status).toBe("draft");
    });

    it("switches the discount back off if the bundle changed while syncing", async () => {
      const bundle = await createBundle(shopA, input());
      const create = fakeGateway.createDiscount.bind(fakeGateway);
      vi.spyOn(fakeGateway, "createDiscount").mockImplementationOnce(async (title, config) => {
        // A concurrent edit lands while Shopify is being called.
        await prisma.bundle.update({
          where: { id: bundle.id },
          data: { title: "Edited meanwhile" },
        });
        return create(title, config);
      });

      const error = await apiError(publishBundle(shopA, bundle.id));
      expect(error.code).toBe("CONFLICT");
      expect((await getBundle(shopA, bundle.id)).status).toBe("draft");
      expect([...fakeGateway.discounts.values()].every((d) => !d.active)).toBe(true);
    });

    it("refuses a bundle that isn't publishable without calling Shopify", async () => {
      const bundle = await createBundle(shopA, input({ products: [] }));
      await apiError(publishBundle(shopA, bundle.id));
      expect(fakeGateway.calls).toEqual([]);
    });
  });

  describe("deactivate", () => {
    it("switches the discount off and keeps it for re-publishing", async () => {
      const bundle = await createBundle(shopA, input());
      await publishBundle(shopA, bundle.id);
      const id = (await storedDiscount(bundle.id))!;

      expect((await deactivateBundle(shopA, bundle.id)).status).toBe("inactive");
      expect(fakeGateway.discounts.get(id)?.active).toBe(false);
      expect(await storedDiscount(bundle.id)).toBe(id);
    });

    it("keeps the bundle active if Shopify fails, so the merchant can retry", async () => {
      const bundle = await createBundle(shopA, input());
      await publishBundle(shopA, bundle.id);
      const id = (await storedDiscount(bundle.id))!;
      fakeGateway.failNext("setActive");

      const error = await apiError(deactivateBundle(shopA, bundle.id));
      expect(error.code).toBe("DISCOUNT_SYNC_FAILED");
      expect((await getBundle(shopA, bundle.id)).status).toBe("active");

      expect((await deactivateBundle(shopA, bundle.id)).status).toBe("inactive");
      expect(fakeGateway.discounts.get(id)?.active).toBe(false);
    });

    it("succeeds when the discount is already gone from Shopify", async () => {
      const bundle = await createBundle(shopA, input());
      await publishBundle(shopA, bundle.id);
      fakeGateway.discounts.clear();
      expect((await deactivateBundle(shopA, bundle.id)).status).toBe("inactive");
      expect(await storedDiscount(bundle.id)).toBeNull();
    });
  });

  describe("delete", () => {
    it("removes an active bundle's discount from Shopify", async () => {
      const bundle = await createBundle(shopA, input());
      await publishBundle(shopA, bundle.id);
      await deleteBundle(shopA, bundle.id);
      expect(fakeGateway.discounts.size).toBe(0);
      expect(await prisma.bundle.count({ where: { id: bundle.id } })).toBe(0);
    });

    it("keeps an active bundle if its discount can't be removed (checkout would still discount it)", async () => {
      const bundle = await createBundle(shopA, input());
      await publishBundle(shopA, bundle.id);
      fakeGateway.failNext("deleteDiscount");
      await apiError(deleteBundle(shopA, bundle.id));
      expect(await prisma.bundle.count({ where: { id: bundle.id } })).toBe(1);
    });

    it("still deletes an inactive bundle when Shopify is unreachable (its discount is already off)", async () => {
      const bundle = await createBundle(shopA, input());
      await publishBundle(shopA, bundle.id);
      await deactivateBundle(shopA, bundle.id);
      fakeGateway.failNext("deleteDiscount", new ShopifyAdminApiError("down"));
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      await deleteBundle(shopA, bundle.id);
      expect(await prisma.bundle.count({ where: { id: bundle.id } })).toBe(0);
    });
  });

  describe("tenant isolation", () => {
    it("another shop can't publish, deactivate or delete a bundle, or touch its discount", async () => {
      const victim = await createBundle(shopA, input({ title: "Victim" }));
      await publishBundle(shopA, victim.id);
      const id = (await storedDiscount(victim.id))!;
      fakeGateway.calls.length = 0;

      for (const attempt of [
        () => publishBundle(shopB, victim.id),
        () => deactivateBundle(shopB, victim.id),
        () => deleteBundle(shopB, victim.id),
      ]) {
        expect(await apiError(attempt())).toMatchObject({ code: "BUNDLE_NOT_FOUND", status: 404 });
      }

      expect(fakeGateway.calls).toEqual([]); // Shopify wasn't contacted at all
      expect(fakeGateway.discounts.get(id)?.active).toBe(true);
      expect((await getBundle(shopA, victim.id)).status).toBe("active");
    });

    it("gives each shop's bundles their own discounts, never shared", async () => {
      const a = await createBundle(shopA, input({ title: "A" }));
      const b = await createBundle(shopB, input({ title: "B" }));
      await publishBundle(shopA, a.id);
      await publishBundle(shopB, b.id);
      const [idA, idB] = [await storedDiscount(a.id), await storedDiscount(b.id)];
      expect(idA).not.toBe(idB);
      expect(fakeGateway.discounts.get(idA!)?.config.bundleId).toBe(a.id);
      expect(fakeGateway.discounts.get(idB!)?.config.bundleId).toBe(b.id);
    });
  });
});
