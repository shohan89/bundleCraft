// @vitest-environment node
import { DEFAULT_CUSTOMIZATION } from "@/lib/customization/defaults";
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { BundleDraftInput } from "@/lib/bundles/types";
import { prisma } from "@/lib/prisma";
import { getDashboardOverview } from "@/services/dashboard/overview";
import { createBundleSeeded as createBundle } from "@/services/products/testing";
import { deleteBundle } from "./delete";
import { duplicateBundle } from "./duplicate";
import { getBundle } from "./get";
import { listBundles } from "./list";
import { deactivateBundle, publishBundle } from "./publish";
import { updateBundle } from "./update";
import { validateBundle } from "./validate";
import { grantPlan } from "@/services/billing/testing";

// Shopify is never called from tests: discount sync runs against an in-memory fake.
vi.mock("@/services/discounts/gateway", async () => {
  const { fakeGateway } = await import("@/services/discounts/test-instance");
  return { openDiscountGateway: async () => fakeGateway };
});

/**
 * Runs against the real database from .env (the same Supabase instance the
 * app uses) using two throwaway shops that are deleted afterwards — bundles,
 * products, and customizations go with them via ON DELETE CASCADE. Skipped
 * automatically when no DATABASE_URL is configured.
 */
const canRun = Boolean(process.env.DATABASE_URL);
const DOMAIN_A = "bundlecraft-engine-test-a.myshopify.com";
const DOMAIN_B = "bundlecraft-engine-test-b.myshopify.com";

function input(overrides: Partial<BundleDraftInput> = {}): BundleDraftInput {
  return {
    title: "Summer Outfit",
    description: null,
    bundleType: "fixed",
    templateId: null,
    requiredQuantity: null,
    discountType: "percentage",
    discountValue: 20,
    products: [{ shopifyProductId: "1001", shopifyVariantId: "2001", quantity: 1 }],
    customization: null,
    ...overrides,
  };
}

const customization = {
  ...DEFAULT_CUSTOMIZATION,
  colors: { ...DEFAULT_CUSTOMIZATION.colors, button: "#222222" },
};

async function expectApiError(promise: Promise<unknown>, code: string, status: number) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).code).toBe(code);
  expect((error as ApiError).status).toBe(status);
  return error as ApiError;
}

describe.skipIf(!canRun)("bundle engine (live database)", () => {
  let shopA: string;
  let shopB: string;
  let templateId: string;

  beforeAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    const a = await prisma.shop.create({
      data: { shopDomain: DOMAIN_A, accessToken: "test-a", email: "a@example.com" },
    });
    const b = await prisma.shop.create({
      data: { shopDomain: DOMAIN_B, accessToken: "test-b", email: "b@example.com" },
    });
    shopA = a.id;
    shopB = b.id;
    await grantPlan(shopA, "pro");
    await grantPlan(shopB, "pro");
    templateId = (await prisma.template.findFirstOrThrow()).id;
  });

  afterAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    await prisma.$disconnect();
  });

  describe("create", () => {
    it("creates fixed, quantity and mix & match bundles as drafts", async () => {
      const fixed = await createBundle(shopA, input({ title: "Fixed" }));
      const quantity = await createBundle(
        shopA,
        input({ title: "Quantity", bundleType: "quantity", requiredQuantity: 3 }),
      );
      const mixMatch = await createBundle(
        shopA,
        input({ title: "Mix", bundleType: "mix_match", requiredQuantity: 2 }),
      );

      expect([fixed.status, quantity.status, mixMatch.status]).toEqual(["draft", "draft", "draft"]);
      expect(quantity.requiredQuantity).toBe(3);
      expect(mixMatch.bundleType).toBe("mix_match");
    });

    it("stores products in order, customization, template, and never exposes shopId", async () => {
      const bundle = await createBundle(
        shopA,
        input({
          templateId,
          products: [
            { shopifyProductId: "1", shopifyVariantId: "11", quantity: 1 },
            { shopifyProductId: "2", shopifyVariantId: "22", quantity: 2 },
          ],
          customization,
        }),
      );

      expect(bundle.products.map((p) => [p.shopifyVariantId, p.position])).toEqual([
        ["11", 0],
        ["22", 1],
      ]);
      expect(bundle.customization).toEqual(customization);
      expect(bundle.templateId).toBe(templateId);
      expect(bundle.discountValue).toBe(20);
      expect(JSON.stringify(bundle)).not.toContain("shopId");
    });

    it("saves an incomplete draft (no products yet)", async () => {
      const bundle = await createBundle(shopA, input({ title: "Incomplete", products: [] }));
      expect(bundle.products).toEqual([]);
    });

    it("rejects invalid input with structured 422 errors and writes nothing", async () => {
      await expectApiError(createBundle(shopA, input({ title: "  " })), "VALIDATION_ERROR", 422);
      await expectApiError(
        createBundle(shopA, input({ title: "Bad discount", discountValue: 150 })),
        "VALIDATION_ERROR",
        422,
      );
      await expectApiError(
        createBundle(
          shopA,
          input({
            title: "Bad product",
            products: [{ shopifyProductId: "abc", shopifyVariantId: "1", quantity: 1 }],
          }),
        ),
        "VALIDATION_ERROR",
        422,
      );
      expect(await prisma.bundle.count({ where: { shopId: shopA, title: "Bad discount" } })).toBe(
        0,
      );
    });

    it("rolls back completely when a later step fails (no partial bundle)", async () => {
      await expectApiError(
        createBundle(
          shopA,
          input({ title: "Rollback me", templateId: randomUUID(), customization }),
        ),
        "INVALID_TEMPLATE",
        422,
      );
      expect(await prisma.bundle.count({ where: { shopId: shopA, title: "Rollback me" } })).toBe(0);
    });
  });

  describe("read", () => {
    it("gets a single bundle and reports not found for unknown ids", async () => {
      const created = await createBundle(shopA, input({ title: "Readable" }));
      expect((await getBundle(shopA, created.id)).title).toBe("Readable");
      await expectApiError(getBundle(shopA, randomUUID()), "BUNDLE_NOT_FOUND", 404);
    });

    it("lists only the calling shop's bundles, newest first", async () => {
      const mine = await createBundle(shopA, input({ title: "Mine-list" }));
      const theirs = await createBundle(shopB, input({ title: "Theirs-list" }));

      const listA = await listBundles(shopA);
      const listB = await listBundles(shopB);

      expect(listA.map((b) => b.id)).toContain(mine.id);
      expect(listA.map((b) => b.id)).not.toContain(theirs.id);
      expect(listB.map((b) => b.id)).toContain(theirs.id);
      expect(listB.map((b) => b.id)).not.toContain(mine.id);
      const times = listA.map((b) => b.createdAt.getTime());
      expect([...times].sort((x, y) => y - x)).toEqual(times);
    });
  });

  describe("tenant isolation (shop A vs shop B's bundle)", () => {
    it("blocks read, update, delete, publish, deactivate, validate and duplicate", async () => {
      const victim = await createBundle(shopB, input({ title: "Victim" }));
      const notFound = (p: Promise<unknown>) => expectApiError(p, "BUNDLE_NOT_FOUND", 404);

      await notFound(getBundle(shopA, victim.id));
      await notFound(updateBundle(shopA, victim.id, { title: "Hijacked" }));
      await notFound(deleteBundle(shopA, victim.id));
      await notFound(publishBundle(shopA, victim.id));
      await notFound(deactivateBundle(shopA, victim.id));
      await notFound(validateBundle(shopA, victim.id));
      await notFound(duplicateBundle(shopA, victim.id));

      const after = await getBundle(shopB, victim.id);
      expect(after.title).toBe("Victim");
      expect(after.status).toBe("draft");
      // The blocked duplicate must not have created anything under shop A.
      expect(
        await prisma.bundle.count({ where: { shopId: shopA, title: { contains: "Victim" } } }),
      ).toBe(0);
    });

    it("keeps an active bundle active and untouched by another shop", async () => {
      const victim = await createBundle(shopB, input({ title: "Victim-active" }));
      await publishBundle(shopB, victim.id);

      await expectApiError(deactivateBundle(shopA, victim.id), "BUNDLE_NOT_FOUND", 404);
      expect((await getBundle(shopB, victim.id)).status).toBe("active");
    });
  });

  describe("update", () => {
    it("updates fields, replaces products, and adds then removes customization", async () => {
      const bundle = await createBundle(shopA, input({ title: "Editable" }));

      const updated = await updateBundle(shopA, bundle.id, {
        title: "Renamed",
        discountType: "fixed_amount",
        discountValue: 15.5,
        products: [
          { shopifyProductId: "5", shopifyVariantId: "55", quantity: 3 },
          { shopifyProductId: "6", shopifyVariantId: "66", quantity: 1 },
        ],
        customization,
      });
      expect(updated).toMatchObject({
        title: "Renamed",
        discountType: "fixed_amount",
        discountValue: 15.5,
        customization,
      });
      expect(updated.products.map((p) => p.shopifyVariantId)).toEqual(["55", "66"]);

      const cleared = await updateBundle(shopA, bundle.id, { customization: null });
      expect(cleared.customization).toBeNull();
      expect(cleared.products).toHaveLength(2); // untouched by a patch that omitted products
    });

    it("clears required quantity when a bundle becomes fixed, and validates the merged result", async () => {
      const bundle = await createBundle(
        shopA,
        input({ title: "Type-switch", bundleType: "quantity", requiredQuantity: 3 }),
      );
      const fixed = await updateBundle(shopA, bundle.id, { bundleType: "fixed" });
      expect(fixed.requiredQuantity).toBeNull();

      await expectApiError(
        updateBundle(shopA, bundle.id, { discountValue: 500 }),
        "VALIDATION_ERROR",
        422,
      );
    });

    it("restores the previous products if the update fails midway (atomic)", async () => {
      const bundle = await createBundle(shopA, input({ title: "Atomic update" }));
      const before = bundle.products.map((p) => p.shopifyVariantId);

      await expectApiError(
        updateBundle(shopA, bundle.id, {
          products: [{ shopifyProductId: "9", shopifyVariantId: "99", quantity: 1 }],
          templateId: randomUUID(), // fails after the product swap has already run
        }),
        "INVALID_TEMPLATE",
        422,
      );

      const after = await getBundle(shopA, bundle.id);
      expect(after.products.map((p) => p.shopifyVariantId)).toEqual(before);
    });

    it("refuses to edit an active bundle until it's deactivated", async () => {
      const bundle = await createBundle(shopA, input({ title: "Active-edit" }));
      await publishBundle(shopA, bundle.id);

      await expectApiError(
        updateBundle(shopA, bundle.id, { title: "Nope" }),
        "BUNDLE_NOT_EDITABLE",
        409,
      );

      await deactivateBundle(shopA, bundle.id);
      expect((await updateBundle(shopA, bundle.id, { title: "Now ok" })).title).toBe("Now ok");
    });
  });

  describe("publish / deactivate lifecycle", () => {
    it("publishes a valid draft to active", async () => {
      const bundle = await createBundle(shopA, input({ title: "Publishable" }));
      expect((await publishBundle(shopA, bundle.id)).status).toBe("active");
    });

    it("refuses to publish an invalid draft, with details, and leaves it a draft", async () => {
      const bundle = await createBundle(shopA, input({ title: "No products", products: [] }));

      const error = await expectApiError(
        publishBundle(shopA, bundle.id),
        "BUNDLE_CANNOT_BE_PUBLISHED",
        422,
      );
      expect(error.details).toContainEqual(expect.objectContaining({ field: "products" }));
      expect((await getBundle(shopA, bundle.id)).status).toBe("draft");
    });

    it("requires a required quantity to publish quantity / mix & match bundles", async () => {
      const bundle = await createBundle(
        shopA,
        input({ title: "No qty", bundleType: "mix_match", requiredQuantity: null }),
      );
      const validation = await validateBundle(shopA, bundle.id);
      expect(validation.valid).toBe(false);
      expect(validation.errors.map((e) => e.field)).toContain("requiredQuantity");
      await expectApiError(publishBundle(shopA, bundle.id), "BUNDLE_CANNOT_BE_PUBLISHED", 422);
    });

    it("reports validity without changing anything", async () => {
      const bundle = await createBundle(shopA, input({ title: "Validate only" }));
      expect(await validateBundle(shopA, bundle.id)).toEqual({ valid: true, errors: [] });
      expect((await getBundle(shopA, bundle.id)).status).toBe("draft");
    });

    it("blocks illegal transitions", async () => {
      const bundle = await createBundle(shopA, input({ title: "Transitions" }));
      await expectApiError(deactivateBundle(shopA, bundle.id), "INVALID_STATUS_TRANSITION", 409);

      await publishBundle(shopA, bundle.id);
      await expectApiError(publishBundle(shopA, bundle.id), "BUNDLE_ALREADY_ACTIVE", 409);
    });

    it("deactivates an active bundle, which then stops counting as active, and can re-publish", async () => {
      const bundle = await createBundle(shopA, input({ title: "Toggle" }));
      await publishBundle(shopA, bundle.id);
      const activeBefore = (await getDashboardOverview(shopA)).activeBundleCount;

      expect((await deactivateBundle(shopA, bundle.id)).status).toBe("inactive");
      expect((await getDashboardOverview(shopA)).activeBundleCount).toBe(activeBefore - 1);

      expect((await publishBundle(shopA, bundle.id)).status).toBe("active");
    });

    it("lets exactly one of two simultaneous publishes win", async () => {
      const bundle = await createBundle(shopA, input({ title: "Race" }));
      const results = await Promise.allSettled([
        publishBundle(shopA, bundle.id),
        publishBundle(shopA, bundle.id),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect((await getBundle(shopA, bundle.id)).status).toBe("active");
    });
  });

  describe("duplicate", () => {
    it("copies a bundle into a new draft with its products and customization", async () => {
      const original = await createBundle(shopA, input({ title: "Original", customization }));
      await publishBundle(shopA, original.id);

      const copy = await duplicateBundle(shopA, original.id);
      expect(copy.id).not.toBe(original.id);
      expect(copy.title).toBe("Original (copy)");
      expect(copy.status).toBe("draft");
      expect(copy.products.map((p) => p.shopifyVariantId)).toEqual(["2001"]);
      expect(copy.customization).toEqual(customization);
    });
  });

  describe("delete", () => {
    it("deletes the bundle and its products/customization, leaving no orphans", async () => {
      const bundle = await createBundle(shopA, input({ title: "Delete me", customization }));

      await deleteBundle(shopA, bundle.id);

      expect(await prisma.bundle.count({ where: { id: bundle.id } })).toBe(0);
      expect(await prisma.bundleProduct.count({ where: { bundleId: bundle.id } })).toBe(0);
      expect(await prisma.customization.count({ where: { bundleId: bundle.id } })).toBe(0);
      await expectApiError(deleteBundle(shopA, bundle.id), "BUNDLE_NOT_FOUND", 404);
    });

    it("cannot delete another shop's bundle", async () => {
      const victim = await createBundle(shopB, input({ title: "Not yours" }));
      await expectApiError(deleteBundle(shopA, victim.id), "BUNDLE_NOT_FOUND", 404);
      expect(await prisma.bundle.count({ where: { id: victim.id } })).toBe(1);
    });
  });
});
