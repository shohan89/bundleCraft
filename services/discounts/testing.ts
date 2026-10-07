/**
 * In-memory stand-in for Shopify's discount API, used by tests. It mimics
 * the behaviour the sync service relies on (create returns a fresh gid,
 * unknown ids come back "not_found", activate/deactivate are idempotent) but
 * it is NOT Shopify: passing tests against it prove our orchestration, not
 * that Shopify accepts our GraphQL. Not imported by production code.
 */
import type { DiscountConfig } from "@/lib/discounts/config";
import { ShopifyAdminApiError } from "@/services/shopify/admin";
import type { DiscountGateway } from "@/services/shopify/discounts";

export interface FakeDiscount {
  title: string;
  active: boolean;
  config: DiscountConfig;
}

export interface FakeGateway extends DiscountGateway {
  discounts: Map<string, FakeDiscount>;
  calls: string[];
  currency: string;
  /** Makes the next call to `method` throw (once), like a Shopify outage. */
  failNext(method: keyof DiscountGateway, error?: Error): void;
  reset(): void;
}

export function createFakeGateway(): FakeGateway {
  // Random base: test files share one real database whose unique index would
  // otherwise see the same fake id from two files running in parallel.
  const base = () => Math.floor(Math.random() * 1e9) * 1000;
  let counter = base();
  const failures = new Map<string, Error>();
  const gateway: FakeGateway = {
    discounts: new Map(),
    calls: [],
    currency: "USD",
    failNext(method, error = new ShopifyAdminApiError("simulated Shopify failure")) {
      failures.set(method, error);
    },
    reset() {
      gateway.discounts.clear();
      gateway.calls.length = 0;
      gateway.currency = "USD";
      failures.clear();
      counter = base();
    },
    async fetchShopCurrency() {
      enter("fetchShopCurrency");
      return gateway.currency;
    },
    async createDiscount(title, config) {
      enter("createDiscount");
      const id = `gid://shopify/DiscountAutomaticNode/${++counter}`;
      gateway.discounts.set(id, { title, active: true, config });
      return id;
    },
    async updateDiscount(id, title, config) {
      enter("updateDiscount");
      const existing = gateway.discounts.get(id);
      if (!existing) return "not_found";
      gateway.discounts.set(id, { ...existing, title, config });
      return "ok";
    },
    async setActive(id, active) {
      enter("setActive");
      const existing = gateway.discounts.get(id);
      if (!existing) return "not_found";
      existing.active = active;
      return "ok";
    },
    async deleteDiscount(id) {
      enter("deleteDiscount");
      return gateway.discounts.delete(id) ? "ok" : "not_found";
    },
  };

  function enter(method: string) {
    gateway.calls.push(method);
    const failure = failures.get(method);
    if (failure) {
      failures.delete(method);
      throw failure;
    }
  }

  return gateway;
}
