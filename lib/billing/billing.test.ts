// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { featureUnavailable, invalidPlan } from "./errors";
import {
  assertCanActivateBundle,
  assertFeature,
  canActivateBundle,
  canUseFeature,
} from "./feature-gates";
import {
  allPlans,
  billingTerms,
  BILLING_CURRENCY,
  getPlan,
  isPaidPlanId,
  isPlanId,
  planChange,
  PLANS,
} from "./plans";
import { FEATURES, PAID_PLAN_IDS, PLAN_IDS } from "./types";
import { parseChargeId, parseCreateBillingBody } from "./validation";

describe("plan configuration", () => {
  it("defines exactly the four documented plans, in ladder order", () => {
    expect(PLAN_IDS).toEqual(["free", "starter", "growth", "pro"]);
    expect(allPlans().map((plan) => plan.id)).toEqual([...PLAN_IDS]);
    expect(allPlans().map((plan) => plan.rank)).toEqual([0, 1, 2, 3]);
  });

  it("uses the documented prices (docs/12-BILLING_SYSTEM.md)", () => {
    expect(allPlans().map((plan) => [plan.name, plan.price])).toEqual([
      ["Free", 0],
      ["Starter", 19],
      ["Growth", 39],
      ["Pro", 79],
    ]);
    expect(BILLING_CURRENCY).toBe("USD");
  });

  it("resolves each plan's limits and features as documented", () => {
    expect(getPlan("free").limits.activeBundles).toBe(1);
    expect(getPlan("starter").limits.activeBundles).toBeNull();
    expect(getPlan("starter").features).toMatchObject({
      templates: true,
      customization: true,
      analytics: false,
    });
    expect(getPlan("growth").features).toMatchObject({ analytics: true, removeBranding: true });
    expect(getPlan("pro").features).toMatchObject({ multipleStores: true, advancedReports: true });
    expect(Object.values(getPlan("free").features).some(Boolean)).toBe(false);
  });

  it("tiers are cumulative: nothing a lower plan has is lost by upgrading", () => {
    const ordered = allPlans();
    for (let i = 1; i < ordered.length; i++) {
      for (const feature of FEATURES) {
        if (ordered[i - 1].features[feature]) expect(ordered[i].features[feature]).toBe(true);
      }
    }
  });

  it("every plan defines every feature (no missing flag can read as undefined)", () => {
    for (const plan of allPlans()) {
      expect(Object.keys(plan.features).sort()).toEqual([...FEATURES].sort());
    }
  });

  it("rejects an unknown plan", () => {
    expect(() => getPlan("platinum")).toThrow(RangeError);
    expect(isPlanId("platinum")).toBe(false);
    expect(isPlanId(undefined)).toBe(false);
    expect(isPaidPlanId("free")).toBe(false);
    expect(PAID_PLAN_IDS.every(isPaidPlanId)).toBe(true);
  });

  it("classifies plan changes by rank", () => {
    expect(planChange("free", "starter")).toBe("upgrade");
    expect(planChange("starter", "growth")).toBe("upgrade");
    expect(planChange("pro", "starter")).toBe("downgrade");
    expect(planChange("growth", "free")).toBe("downgrade");
    expect(planChange("growth", "growth")).toBe("current");
  });

  it("the billing terms come only from the config", () => {
    expect(billingTerms("growth")).toEqual({
      name: "BundleCraft Growth",
      amount: 39,
      currencyCode: "USD",
      interval: "EVERY_30_DAYS",
    });
    expect(Object.keys(PLANS)).not.toContain("platinum");
  });
});

describe("feature gates", () => {
  it("allows a feature only on plans that include it", () => {
    expect(canUseFeature("free", "analytics")).toBe(false);
    expect(canUseFeature("starter", "analytics")).toBe(false);
    expect(canUseFeature("growth", "analytics")).toBe(true);
    expect(canUseFeature("pro", "analytics")).toBe(true);
    expect(canUseFeature("starter", "customization")).toBe(true);
  });

  it("denies with a structured, upgrade-pointing error", () => {
    let error: unknown;
    try {
      assertFeature("starter", "analytics");
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "PLAN_FEATURE_UNAVAILABLE", status: 403 });
    expect((error as ApiError).message).toContain("Growth");
    expect(() => assertFeature("growth", "analytics")).not.toThrow();
    expect(featureUnavailable("advancedReports").message).toContain("Pro");
  });

  it("enforces the active-bundle limit (Free = 1, paid = unlimited)", () => {
    expect(canActivateBundle("free", 0)).toBe(true);
    expect(canActivateBundle("free", 1)).toBe(false);
    expect(canActivateBundle("starter", 500)).toBe(true);

    let error: unknown;
    try {
      assertCanActivateBundle("free", 1);
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ code: "PLAN_LIMIT_REACHED", status: 403 });
    expect((error as ApiError).message).toMatch(/1 active bundle/);
    expect(() => assertCanActivateBundle("free", 0)).not.toThrow();
    expect(() => assertCanActivateBundle("pro", 10_000)).not.toThrow();
  });
});

describe("billing input validation", () => {
  it("accepts only a paid plan name", () => {
    for (const plan of PAID_PLAN_IDS) expect(parseCreateBillingBody({ plan })).toEqual({ plan });
  });

  it("rejects free, unknown plans and wrong types with INVALID_PLAN", () => {
    for (const plan of ["free", "platinum", "STARTER", ""]) {
      expect(() => parseCreateBillingBody({ plan })).toThrow(invalidPlan().message);
    }
    expect(() => parseCreateBillingBody({ plan: 1 })).toThrow(ApiError);
    expect(() => parseCreateBillingBody({})).toThrow(ApiError);
    expect(() => parseCreateBillingBody(null)).toThrow(ApiError);
    expect(() => parseCreateBillingBody("starter")).toThrow(ApiError);
  });

  it("rejects any client-supplied price, amount, shop id or status", () => {
    for (const extra of [
      { price: 0 },
      { amount: 1 },
      { shopId: "another-shop" },
      { status: "active" },
      { test: false },
      { currency: "EUR" },
    ]) {
      expect(() => parseCreateBillingBody({ plan: "starter", ...extra })).toThrow(ApiError);
    }
  });

  it("parses Shopify's charge_id into a subscription gid", () => {
    expect(parseChargeId("4412")).toBe("gid://shopify/AppSubscription/4412");
    for (const bad of [
      null,
      "",
      "abc",
      "12 34",
      "1".repeat(30),
      "gid://shopify/AppSubscription/1",
    ]) {
      expect(parseChargeId(bad)).toBeNull();
    }
  });
});
