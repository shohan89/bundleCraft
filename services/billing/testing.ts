/**
 * Test doubles for billing. The fake gateway mimics the parts of Shopify's
 * app-subscription API the billing service relies on (a created subscription
 * is PENDING until the "merchant" approves it, reads return what was
 * created, cancel is idempotent) but it is NOT Shopify: tests using it prove
 * our orchestration, not that Shopify accepts our GraphQL. Not imported by
 * production code.
 */
import type { PlanId } from "@/lib/billing/types";
import { prisma } from "@/lib/prisma";
import { ShopifyAdminApiError } from "@/services/shopify/admin";
import type {
  BillingGateway,
  CreateSubscriptionInput,
  RemoteSubscription,
  ShopifySubscriptionStatus,
} from "@/services/shopify/billing";

export interface FakeBillingGateway extends BillingGateway {
  subscriptions: Map<string, RemoteSubscription>;
  calls: string[];
  created: CreateSubscriptionInput[];
  /** Plays the merchant approving on Shopify's page. Replaces the previously active subscription, as Shopify does. */
  approve(id: string): void;
  setStatus(id: string, status: ShopifySubscriptionStatus): void;
  /** Makes Shopify report a different price than we asked for. */
  tamperPrice(id: string, amount: number): void;
  failNext(method: keyof BillingGateway, error?: Error): void;
  reset(): void;
}

export function createFakeBillingGateway(): FakeBillingGateway {
  // Random base: test files share one real database with a unique index on the charge id.
  const base = () => Math.floor(Math.random() * 1e9) * 1000;
  let counter = base();
  const failures = new Map<string, Error>();

  const gateway: FakeBillingGateway = {
    subscriptions: new Map(),
    calls: [],
    created: [],
    approve(id) {
      for (const other of gateway.subscriptions.values()) {
        if (other.id !== id && other.status === "ACTIVE") other.status = "CANCELLED";
      }
      const sub = gateway.subscriptions.get(id);
      if (sub) {
        sub.status = "ACTIVE";
        sub.currentPeriodEnd = new Date(Date.now() + 30 * 86_400_000).toISOString();
      }
    },
    setStatus(id, status) {
      const sub = gateway.subscriptions.get(id);
      if (sub) sub.status = status;
    },
    tamperPrice(id, amount) {
      const sub = gateway.subscriptions.get(id);
      if (sub?.price) sub.price = { ...sub.price, amount };
    },
    failNext(method, error = new ShopifyAdminApiError("simulated Shopify failure")) {
      failures.set(method, error);
    },
    reset() {
      gateway.subscriptions.clear();
      gateway.calls.length = 0;
      gateway.created.length = 0;
      failures.clear();
      counter = base();
    },

    async createSubscription(input) {
      enter("createSubscription");
      const id = `gid://shopify/AppSubscription/${++counter}`;
      gateway.created.push(input);
      gateway.subscriptions.set(id, {
        id,
        name: input.name,
        status: "PENDING",
        test: input.test,
        currentPeriodEnd: null,
        price: { amount: input.amount, currencyCode: input.currencyCode, interval: input.interval },
      });
      return {
        id,
        confirmationUrl: `https://fake-shop.myshopify.com/admin/charges/${counter}/confirm`,
      };
    },
    async getSubscription(id) {
      enter("getSubscription");
      const sub = gateway.subscriptions.get(id);
      return sub ? { ...sub, price: sub.price ? { ...sub.price } : null } : null;
    },
    async cancelSubscription(id) {
      enter("cancelSubscription");
      const sub = gateway.subscriptions.get(id);
      if (!sub) return "NOT_FOUND";
      if (sub.status === "ACTIVE" || sub.status === "PENDING") sub.status = "CANCELLED";
      return sub.status;
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

/** Puts a shop on a paid plan directly in the database, as a verified active subscription. */
export async function grantPlan(shopId: string, plan: Exclude<PlanId, "free">): Promise<string> {
  const shopifyChargeId = `gid://shopify/AppSubscription/${Math.floor(Math.random() * 1e12)}`;
  await prisma.subscription.create({
    data: { shopId, plan, status: "active", shopifyChargeId, isTest: true },
  });
  await prisma.shop.update({ where: { id: shopId }, data: { plan } });
  return shopifyChargeId;
}
