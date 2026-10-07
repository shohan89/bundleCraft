// @vitest-environment node
import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { BundleDraftInput } from "@/lib/bundles/types";
import { prisma } from "@/lib/prisma";
import { createBundleSeeded as createBundle } from "@/services/products/testing";
import { deactivateBundle, publishBundle } from "@/services/bundles/publish";
import { ShopifyAdminApiError } from "@/services/shopify/admin";
import { assertActiveBundleCapacity, assertFeatureAccess, hasFeatureAccess } from "./access";
import { cancelSubscription } from "./cancel";
import { createSubscription } from "./create";
import { getBillingState, getEffectivePlan, syncSubscription } from "./subscriptions";
import { fakeBilling } from "./test-instance";
import { grantPlan } from "./testing";

// Shopify is never called: billing runs against an in-memory fake, so these tests prove our
// orchestration (verification, idempotency, tenant scoping, failure handling) against a real
// database, NOT that Shopify accepts our GraphQL (see services/shopify/billing.test.ts).
vi.mock("@/services/billing/gateway", async () => {
  const { fakeBilling } = await import("@/services/billing/test-instance");
  return { openBillingGateway: async () => fakeBilling };
});
// Publishing also syncs a discount; keep that off the network too.
vi.mock("@/services/discounts/gateway", async () => {
  const { fakeGateway } = await import("@/services/discounts/test-instance");
  return { openDiscountGateway: async () => fakeGateway };
});

const canRun = Boolean(process.env.DATABASE_URL) && Boolean(process.env.SHOPIFY_APP_URL);
const DOMAIN_A = "bundlecraft-billing-test-a.myshopify.com";
const DOMAIN_B = "bundlecraft-billing-test-b.myshopify.com";

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

async function apiError(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

describe.skipIf(!canRun)("billing (live database, fake Shopify)", () => {
  let shopA: { id: string; shopDomain: string };
  let shopB: { id: string; shopDomain: string };

  const rows = (shopId: string) =>
    prisma.subscription.findMany({ where: { shopId }, orderBy: { createdAt: "asc" } });
  const shopPlan = async (shopId: string) =>
    (await prisma.shop.findUniqueOrThrow({ where: { id: shopId } })).plan;

  /** Start a plan and play the merchant approving it at Shopify. */
  async function subscribe(
    shop: { id: string; shopDomain: string },
    plan: "starter" | "growth" | "pro",
  ) {
    const { confirmationUrl } = await createSubscription(shop, plan);
    const charge = (await rows(shop.id)).at(-1)!.shopifyChargeId;
    fakeBilling.approve(charge);
    await syncSubscription(shop.id, charge);
    return { charge, confirmationUrl };
  }

  beforeAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    shopA = await prisma.shop.create({
      data: { shopDomain: DOMAIN_A, accessToken: "x", email: "a@example.com" },
      select: { id: true, shopDomain: true },
    });
    shopB = await prisma.shop.create({
      data: { shopDomain: DOMAIN_B, accessToken: "x", email: "b@example.com" },
      select: { id: true, shopDomain: true },
    });
  });

  afterAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    fakeBilling.reset();
    await prisma.subscription.deleteMany({ where: { shopId: { in: [shopA.id, shopB.id] } } });
    await prisma.bundle.deleteMany({ where: { shopId: { in: [shopA.id, shopB.id] } } });
    await prisma.shop.updateMany({
      where: { id: { in: [shopA.id, shopB.id] } },
      data: { plan: "free" },
    });
  });

  describe("the Free plan", () => {
    it("is the valid default: no subscription, plan free, nothing forced", async () => {
      expect(await getEffectivePlan(shopA.id)).toBe("free");
      const state = await getBillingState(shopA.id);
      expect(state).toMatchObject({
        plan: "free",
        status: "active",
        subscription: null,
        pendingPlan: null,
        verification: "ok",
        usage: { activeBundles: 0, activeBundleLimit: 1, overLimit: false },
      });
      expect(state.features.analytics).toBe(false);
      expect(fakeBilling.calls).toEqual([]); // nothing asked of Shopify
    });
  });

  describe("creating a subscription", () => {
    it("creates a Shopify charge from the server's plan config and stores it as PENDING", async () => {
      const result = await createSubscription(shopA, "growth");
      expect(result).toMatchObject({ plan: "growth", resumed: false });
      expect(result.confirmationUrl).toMatch(/^https:\/\//);

      expect(fakeBilling.created).toHaveLength(1);
      expect(fakeBilling.created[0]).toMatchObject({
        name: "BundleCraft Growth",
        amount: 39,
        currencyCode: "USD",
        interval: "EVERY_30_DAYS",
        test: true,
      });
      expect(fakeBilling.created[0].returnUrl).toMatch(/\/api\/billing\/callback$/);

      const [row] = await rows(shopA.id);
      expect(row).toMatchObject({ plan: "growth", status: "pending", isTest: true });
      expect(row.confirmationUrl).toBe(result.confirmationUrl);
    });

    it("does NOT change the plan until Shopify has approved it and the server verified it", async () => {
      await createSubscription(shopA, "starter");
      expect(await getEffectivePlan(shopA.id)).toBe("free");
      expect(await shopPlan(shopA.id)).toBe("free");
      expect(await hasFeatureAccess(shopA.id, "customization")).toBe(false);
    });

    it("activates only after Shopify reports ACTIVE, then applies the plan and its features", async () => {
      await subscribe(shopA, "growth");
      expect(await getEffectivePlan(shopA.id)).toBe("growth");
      expect(await shopPlan(shopA.id)).toBe("growth");
      const [row] = await rows(shopA.id);
      expect(row).toMatchObject({ status: "active", confirmationUrl: null });
      expect(row.currentPeriodEnd).not.toBeNull();
      expect(await hasFeatureAccess(shopA.id, "analytics")).toBe(true);
    });

    it("a double click or retry returns the same approval page: one charge, one row", async () => {
      const results = await Promise.all([
        createSubscription(shopA, "starter"),
        createSubscription(shopA, "starter"),
        createSubscription(shopA, "starter"),
      ]);
      expect(fakeBilling.created).toHaveLength(1);
      expect(await rows(shopA.id)).toHaveLength(1);
      expect(new Set(results.map((r) => r.confirmationUrl)).size).toBe(1);
      expect(results.filter((r) => r.resumed)).toHaveLength(2);

      const again = await createSubscription(shopA, "starter");
      expect(again.resumed).toBe(true);
      expect(fakeBilling.created).toHaveLength(1);
    });

    it("refuses a plan the shop already has", async () => {
      await subscribe(shopA, "starter");
      const error = await apiError(createSubscription(shopA, "starter"));
      expect(error).toMatchObject({ code: "SUBSCRIPTION_ALREADY_ACTIVE", status: 409 });
      expect(fakeBilling.created).toHaveLength(1);
    });

    it("surfaces a Shopify failure safely and stores nothing, so a retry works", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      fakeBilling.failNext("createSubscription", new ShopifyAdminApiError("boom shpat_secret"));
      const error = await apiError(createSubscription(shopA, "starter"));
      expect(error).toMatchObject({ code: "BILLING_CREATION_FAILED", status: 502 });
      expect(error.message).not.toMatch(/boom|shpat/);
      expect(await rows(shopA.id)).toHaveLength(0);

      expect((await createSubscription(shopA, "starter")).resumed).toBe(false);
      expect(await rows(shopA.id)).toHaveLength(1);
    });
  });

  describe("synchronisation with Shopify", () => {
    it("a rejected approval (DECLINED) leaves the shop on Free and records the outcome", async () => {
      await createSubscription(shopA, "growth");
      const [{ shopifyChargeId }] = await rows(shopA.id);
      fakeBilling.setStatus(shopifyChargeId, "DECLINED");
      await syncSubscription(shopA.id, shopifyChargeId);
      const [row] = await rows(shopA.id);
      expect(row.status).toBe("cancelled");
      expect(await getEffectivePlan(shopA.id)).toBe("free");
    });

    it("expired and frozen subscriptions end the paid plan", async () => {
      for (const status of ["EXPIRED", "FROZEN"] as const) {
        await prisma.subscription.deleteMany({ where: { shopId: shopA.id } });
        const { charge } = await subscribe(shopA, "starter");
        expect(await getEffectivePlan(shopA.id)).toBe("starter");

        fakeBilling.setStatus(charge, status);
        await syncSubscription(shopA.id, charge);
        expect((await rows(shopA.id))[0].status).toBe("expired");
        expect(await getEffectivePlan(shopA.id)).toBe("free");
        expect(await shopPlan(shopA.id)).toBe("free");
      }
    });

    it("cancelled in the Shopify admin: the next sync (webhook or page load) downgrades to Free", async () => {
      const { charge } = await subscribe(shopA, "pro");
      fakeBilling.setStatus(charge, "CANCELLED");
      await syncSubscription(shopA.id, charge);
      expect(await getEffectivePlan(shopA.id)).toBe("free");
      expect((await getBillingState(shopA.id)).subscription).toMatchObject({
        plan: "pro",
        status: "cancelled",
      });
    });

    it("a subscription Shopify no longer knows about is closed, never left active", async () => {
      const { charge } = await subscribe(shopA, "starter");
      fakeBilling.subscriptions.delete(charge);
      await syncSubscription(shopA.id, charge);
      expect((await rows(shopA.id))[0].status).toBe("cancelled");
      expect(await getEffectivePlan(shopA.id)).toBe("free");
    });

    it("refuses to activate when Shopify's price or name doesn't match our plan config", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      await createSubscription(shopA, "growth");
      const [{ shopifyChargeId }] = await rows(shopA.id);
      fakeBilling.approve(shopifyChargeId);
      fakeBilling.tamperPrice(shopifyChargeId, 1); // Shopify holds $1, we expect $39

      const error = await apiError(syncSubscription(shopA.id, shopifyChargeId));
      expect(error).toMatchObject({ code: "BILLING_VERIFICATION_FAILED", status: 502 });
      expect((await rows(shopA.id))[0].status).toBe("pending");
      expect(await getEffectivePlan(shopA.id)).toBe("free");
    });

    it("is idempotent: repeating a sync (callback refresh, webhook retry) changes nothing more", async () => {
      const { charge } = await subscribe(shopA, "growth");
      const before = await rows(shopA.id);
      await syncSubscription(shopA.id, charge);
      await syncSubscription(shopA.id, charge);
      await Promise.all([syncSubscription(shopA.id, charge), syncSubscription(shopA.id, charge)]);
      const after = await rows(shopA.id);
      expect(after).toHaveLength(1);
      expect(after[0].status).toBe("active");
      expect(after[0].startedAt.getTime()).toBe(before[0].startedAt.getTime());
    });

    it("never lets a settled subscription slip back to pending", async () => {
      const { charge } = await subscribe(shopA, "starter");
      fakeBilling.setStatus(charge, "PENDING");
      await syncSubscription(shopA.id, charge);
      expect((await rows(shopA.id))[0].status).toBe("active");
    });

    it("the billing page verifies a pending subscription itself (a merchant who just approved sees the new plan)", async () => {
      await createSubscription(shopA, "starter");
      const [{ shopifyChargeId }] = await rows(shopA.id);
      expect((await getBillingState(shopA.id)).pendingPlan).toBe("starter");

      fakeBilling.approve(shopifyChargeId);
      const state = await getBillingState(shopA.id);
      expect(state).toMatchObject({ plan: "starter", status: "active", pendingPlan: null });
    });

    it("when Shopify can't be reached, the state still returns, honestly marked unverified", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      await createSubscription(shopA, "starter");
      fakeBilling.failNext("getSubscription");
      const state = await getBillingState(shopA.id);
      expect(state).toMatchObject({
        plan: "free",
        pendingPlan: "starter",
        verification: "unavailable",
      });
    });
  });

  describe("plan changes", () => {
    it("upgrade: the new plan applies only after approval; the old subscription is kept as history", async () => {
      const first = await subscribe(shopA, "starter");
      await createSubscription(shopA, "growth");
      expect(await getEffectivePlan(shopA.id)).toBe("starter"); // not yet

      const growth = (await rows(shopA.id)).find((r) => r.plan === "growth")!;
      fakeBilling.approve(growth.shopifyChargeId);
      await syncSubscription(shopA.id, growth.shopifyChargeId);

      expect(await getEffectivePlan(shopA.id)).toBe("growth");
      const all = await rows(shopA.id);
      expect(all).toHaveLength(2);
      expect(all.filter((r) => r.status === "active")).toHaveLength(1);
      expect(all.find((r) => r.shopifyChargeId === first.charge)).toMatchObject({
        status: "cancelled",
      });
    });

    it("downgrade between paid plans follows the same approve-then-verify flow", async () => {
      await subscribe(shopA, "pro");
      await createSubscription(shopA, "starter");
      expect(await getEffectivePlan(shopA.id)).toBe("pro");
      const starter = (await rows(shopA.id)).find((r) => r.plan === "starter")!;
      fakeBilling.approve(starter.shopifyChargeId);
      await syncSubscription(shopA.id, starter.shopifyChargeId);
      expect(await getEffectivePlan(shopA.id)).toBe("starter");
      expect(await hasFeatureAccess(shopA.id, "analytics")).toBe(false);
    });
  });

  describe("cancellation", () => {
    it("cancels at Shopify, returns to Free, and keeps the record as history", async () => {
      const { charge } = await subscribe(shopA, "growth");
      const result = await cancelSubscription(shopA.id);
      expect(result).toEqual({ plan: "free", status: "cancelled" });
      expect(fakeBilling.subscriptions.get(charge)?.status).toBe("CANCELLED");

      const [row] = await rows(shopA.id);
      expect(row).toMatchObject({ plan: "growth", status: "cancelled" });
      expect(row.cancelledAt).not.toBeNull();
      expect(await shopPlan(shopA.id)).toBe("free");
    });

    it("cancelling again finds nothing to cancel and corrupts nothing", async () => {
      await subscribe(shopA, "starter");
      await cancelSubscription(shopA.id);
      const error = await apiError(cancelSubscription(shopA.id));
      expect(error).toMatchObject({ code: "SUBSCRIPTION_NOT_FOUND", status: 404 });
      const all = await rows(shopA.id);
      expect(all).toHaveLength(1);
      expect(all[0].status).toBe("cancelled");
      expect(await getEffectivePlan(shopA.id)).toBe("free");
    });

    it("a Shopify failure leaves the plan untouched, and a retry succeeds", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      await subscribe(shopA, "starter");
      fakeBilling.failNext("cancelSubscription");
      const error = await apiError(cancelSubscription(shopA.id));
      expect(error).toMatchObject({ code: "SUBSCRIPTION_CANCEL_FAILED", status: 502 });
      expect(await getEffectivePlan(shopA.id)).toBe("starter");

      expect((await cancelSubscription(shopA.id)).plan).toBe("free");
    });

    it("has nothing to cancel on the Free plan", async () => {
      await expect(cancelSubscription(shopA.id)).rejects.toMatchObject({
        code: "SUBSCRIPTION_NOT_FOUND",
      });
    });

    it("keeps bundles active after a downgrade, but blocks publishing beyond the Free limit", async () => {
      await subscribe(shopA, "starter");
      const a = await createBundle(shopA.id, draft("One"));
      const b = await createBundle(shopA.id, draft("Two"));
      await publishBundle(shopA.id, a.id);
      await publishBundle(shopA.id, b.id);

      await cancelSubscription(shopA.id);
      const state = await getBillingState(shopA.id);
      expect(state.usage).toEqual({ activeBundles: 2, activeBundleLimit: 1, overLimit: true });
      expect(await prisma.bundle.count({ where: { shopId: shopA.id, status: "active" } })).toBe(2);

      const c = await createBundle(shopA.id, draft("Three"));
      expect(await apiError(publishBundle(shopA.id, c.id))).toMatchObject({
        code: "PLAN_LIMIT_REACHED",
      });
    });
  });

  describe("feature gates and plan limits (server-side)", () => {
    it("Free allows one active bundle; the second is refused with PLAN_LIMIT_REACHED and nothing else changes", async () => {
      const first = await createBundle(shopA.id, draft("First"));
      const second = await createBundle(shopA.id, draft("Second"));
      expect((await publishBundle(shopA.id, first.id)).status).toBe("active");

      const error = await apiError(publishBundle(shopA.id, second.id));
      expect(error).toMatchObject({ code: "PLAN_LIMIT_REACHED", status: 403 });
      expect(error.message).toMatch(/Upgrade/);
      expect((await prisma.bundle.findUniqueOrThrow({ where: { id: second.id } })).status).toBe(
        "draft",
      );
    });

    it("drafts are unlimited on Free; deactivating frees the slot", async () => {
      const bundles = await Promise.all(
        ["A", "B", "C"].map((title) => createBundle(shopA.id, draft(title))),
      );
      expect(bundles).toHaveLength(3);
      await publishBundle(shopA.id, bundles[0].id);
      await deactivateBundle(shopA.id, bundles[0].id);
      expect((await publishBundle(shopA.id, bundles[1].id)).status).toBe("active");
    });

    it("two simultaneous publishes on Free can't both succeed", async () => {
      const a = await createBundle(shopA.id, draft("Race A"));
      const b = await createBundle(shopA.id, draft("Race B"));
      const results = await Promise.allSettled([
        publishBundle(shopA.id, a.id),
        publishBundle(shopA.id, b.id),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await prisma.bundle.count({ where: { shopId: shopA.id, status: "active" } })).toBe(1);
    });

    it("paid plans lift the limit", async () => {
      await grantPlan(shopA.id, "starter");
      for (const title of ["1", "2", "3"]) {
        const bundle = await createBundle(shopA.id, draft(title));
        expect((await publishBundle(shopA.id, bundle.id)).status).toBe("active");
      }
      await expect(assertActiveBundleCapacity(shopA.id)).resolves.toBeUndefined();
    });

    it("analytics is denied below Growth and allowed from Growth", async () => {
      expect(await apiError(assertFeatureAccess(shopA.id, "analytics"))).toMatchObject({
        code: "PLAN_FEATURE_UNAVAILABLE",
        status: 403,
      });
      await grantPlan(shopA.id, "starter");
      expect(await hasFeatureAccess(shopA.id, "analytics")).toBe(false);
      await prisma.subscription.deleteMany({ where: { shopId: shopA.id } });
      await grantPlan(shopA.id, "growth");
      expect(await hasFeatureAccess(shopA.id, "analytics")).toBe(true);
    });

    it("only a verified ACTIVE subscription grants a plan: pending, cancelled and expired rows grant nothing", async () => {
      for (const status of ["pending", "cancelled", "expired"] as const) {
        await prisma.subscription.create({
          data: {
            shopId: shopA.id,
            plan: "pro",
            status,
            shopifyChargeId: `gid://shopify/AppSubscription/${Math.floor(Math.random() * 1e12)}`,
          },
        });
      }
      expect(await getEffectivePlan(shopA.id)).toBe("free");
      expect(await hasFeatureAccess(shopA.id, "advancedReports")).toBe(false);
    });
  });

  describe("tenant isolation", () => {
    it("shop A's plan, subscription and history are invisible to and unaffected by shop B", async () => {
      await subscribe(shopA, "pro");
      expect(await getEffectivePlan(shopB.id)).toBe("free");
      expect((await getBillingState(shopB.id)).subscription).toBeNull();
      expect(await hasFeatureAccess(shopB.id, "analytics")).toBe(false);
    });

    it("shop B can't sync, and so can't modify, shop A's subscription by its charge id", async () => {
      await createSubscription(shopA, "growth");
      const [{ shopifyChargeId }] = await rows(shopA.id);
      fakeBilling.approve(shopifyChargeId);

      expect(await apiError(syncSubscription(shopB.id, shopifyChargeId))).toMatchObject({
        code: "SUBSCRIPTION_NOT_FOUND",
      });
      expect((await rows(shopA.id))[0].status).toBe("pending"); // untouched
      expect(await getEffectivePlan(shopB.id)).toBe("free");
    });

    it("shop B cancelling can't cancel shop A", async () => {
      await subscribe(shopA, "starter");
      await expect(cancelSubscription(shopB.id)).rejects.toMatchObject({
        code: "SUBSCRIPTION_NOT_FOUND",
      });
      expect(await getEffectivePlan(shopA.id)).toBe("starter");
    });

    it("both shops can subscribe independently without interfering", async () => {
      await subscribe(shopA, "starter");
      await subscribe(shopB, "pro");
      expect(await getEffectivePlan(shopA.id)).toBe("starter");
      expect(await getEffectivePlan(shopB.id)).toBe("pro");
      await cancelSubscription(shopA.id);
      expect(await getEffectivePlan(shopB.id)).toBe("pro");
    });

    it("a Shopify subscription can only ever be recorded once", async () => {
      await createSubscription(shopA, "starter");
      const [{ shopifyChargeId }] = await rows(shopA.id);
      await expect(
        prisma.subscription.create({
          data: { shopId: shopB.id, plan: "starter", status: "pending", shopifyChargeId },
        }),
      ).rejects.toThrow();
    });
  });
});
