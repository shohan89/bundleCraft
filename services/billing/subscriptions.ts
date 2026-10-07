import { billingTerms, isPlanId, PLANS } from "@/lib/billing/plans";
import { billingVerificationFailed, subscriptionNotFound } from "@/lib/billing/errors";
import { activeBundleLimit } from "@/lib/billing/feature-gates";
import type {
  BillingState,
  PaidPlanId,
  PlanId,
  SubscriptionStatus,
  SubscriptionSummary,
} from "@/lib/billing/types";
import { ApiError } from "@/lib/api/errors";
import type { Subscription } from "@/lib/generated/prisma/client";
import { errorFields, logEvent } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import type { BillingGateway, RemoteSubscription } from "@/services/shopify/billing";
import { openBillingGateway } from "./gateway";
import { lockShopBilling } from "./lock";

/**
 * The subscription lifecycle. The `subscriptions` table is a local mirror of
 * Shopify's truth: a row only becomes `active` after Shopify itself reports
 * the subscription ACTIVE *and* its name/price match our plan config for the
 * plan we requested. Browser input never sets a status.
 */

const MAX_PENDING_CHECKED = 5;

/** Shopify status -> ours. DECLINED (merchant refused) and FROZEN (payment failure) have no local twin. */
export function mapShopifyStatus(status: RemoteSubscription["status"]): SubscriptionStatus {
  switch (status) {
    case "ACTIVE":
      return "active";
    case "PENDING":
      return "pending";
    case "CANCELLED":
    case "DECLINED":
      return "cancelled";
    case "EXPIRED":
    case "FROZEN":
      return "expired";
  }
}

/** Does what Shopify holds equal what our config says this plan costs? */
export function remoteMatchesPlan(remote: RemoteSubscription, plan: PaidPlanId): boolean {
  const terms = billingTerms(plan);
  return (
    remote.name === terms.name &&
    remote.price !== null &&
    remote.price.amount === terms.amount &&
    remote.price.currencyCode === terms.currencyCode &&
    remote.price.interval === terms.interval
  );
}

const iso = (date: Date | null) => (date ? date.toISOString() : null);

function toSummary(row: Subscription): SubscriptionSummary {
  return {
    plan: isPlanId(row.plan) ? row.plan : "free",
    status: row.status,
    startedAt: row.status === "pending" ? null : iso(row.startedAt),
    cancelledAt: iso(row.cancelledAt),
    currentPeriodEnd: iso(row.currentPeriodEnd),
    isTest: row.isTest,
  };
}

/** The plan in force: the shop's verified active subscription, or Free. Authoritative. */
export async function getEffectivePlan(shopId: string): Promise<PlanId> {
  const row = await prisma.subscription.findFirst({
    where: { shopId, status: "active" },
    orderBy: { startedAt: "desc" },
    select: { plan: true },
  });
  return row && isPlanId(row.plan) ? row.plan : "free";
}

/**
 * Brings one local row in line with what Shopify reports, atomically and
 * idempotently: repeating it (callback refresh, webhook retry, page reload)
 * changes nothing the second time.
 */
async function applyRemoteState(
  shopId: string,
  rowId: string,
  remote: RemoteSubscription | null,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockShopBilling(tx, shopId);
    const row = await tx.subscription.findFirst({ where: { id: rowId, shopId } });
    if (!row) return;

    // A subscription Shopify no longer knows about is over.
    const target: SubscriptionStatus = remote
      ? mapShopifyStatus(remote.status)
      : row.status === "pending"
        ? "expired"
        : "cancelled";

    // A settled subscription never goes back to "waiting".
    if (target === "pending" && row.status !== "pending") return;

    const now = new Date();
    if (target === "active") {
      if (row.status !== "active") {
        // Shopify replaces the previous subscription when a new one is approved.
        await tx.subscription.updateMany({
          where: { shopId, status: "active", id: { not: row.id } },
          data: { status: "cancelled", cancelledAt: now },
        });
      }
      await tx.subscription.update({
        where: { id: row.id },
        data: {
          status: "active",
          startedAt: row.status === "active" ? row.startedAt : now,
          cancelledAt: null,
          currentPeriodEnd: remote?.currentPeriodEnd ? new Date(remote.currentPeriodEnd) : null,
          isTest: remote?.test ?? row.isTest,
          confirmationUrl: null,
        },
      });
      await tx.shop.update({ where: { id: shopId }, data: { plan: row.plan } });
      return;
    }

    if (target === "pending") return; // still waiting for the merchant

    if (row.status !== target) {
      await tx.subscription.update({
        where: { id: row.id },
        data: { status: target, cancelledAt: row.cancelledAt ?? now, confirmationUrl: null },
      });
    }
    if (row.status === "active") {
      // The paid plan is over: back to Free unless another subscription is active.
      const other = await tx.subscription.findFirst({
        where: { shopId, status: "active", id: { not: row.id } },
      });
      await tx.shop.update({ where: { id: shopId }, data: { plan: other?.plan ?? "free" } });
    }
  });
}

/**
 * Reads the subscription back from Shopify and applies it. `shopId` scopes
 * the lookup: another shop's charge id matches no row.
 */
export async function syncSubscription(
  shopId: string,
  chargeId: string,
  gateway?: BillingGateway,
): Promise<Subscription> {
  const row = await prisma.subscription.findFirst({ where: { shopId, shopifyChargeId: chargeId } });
  if (!row) throw subscriptionNotFound();

  const client = gateway ?? (await openBillingGateway(shopId));
  const remote = await client.getSubscription(chargeId);

  if (
    remote &&
    mapShopifyStatus(remote.status) === "active" &&
    !remoteMatchesPlan(remote, row.plan as PaidPlanId)
  ) {
    logEvent("error", "billing_verification_mismatch", { shopId, subscriptionId: row.id });
    throw billingVerificationFailed();
  }

  await applyRemoteState(shopId, row.id, remote);
  return prisma.subscription.findUniqueOrThrow({ where: { id: row.id } });
}

/** Converts anything a Shopify billing call can throw into a merchant-safe ApiError. */
export function toBillingError(
  error: unknown,
  fallback: () => ApiError,
  context: Record<string, string>,
): ApiError {
  if (error instanceof ApiError) return error;
  logEvent("error", "billing_operation_failed", { ...context, ...errorFields(error) });
  return fallback();
}

/**
 * GET /api/billing/current. If a plan change is waiting for approval, Shopify
 * is asked about it first (so a merchant who just approved sees their new
 * plan even before a webhook arrives). If Shopify can't be reached the
 * answer still comes back, marked `verification: "unavailable"`.
 */
export async function getBillingState(shopId: string): Promise<BillingState> {
  let verification: BillingState["verification"] = "ok";

  // The common case (nothing waiting for approval) needs ONE round of queries: the pending
  // check runs alongside the state reads. Only when something is pending do we ask Shopify and
  // read the state again, so the answer reflects what Shopify just reported.
  const readState = () =>
    Promise.all([
      prisma.subscription.findMany({
        where: { shopId, status: "pending" },
        orderBy: { createdAt: "desc" },
        take: MAX_PENDING_CHECKED,
      }),
      prisma.subscription.findFirst({
        where: { shopId, status: "active" },
        orderBy: { startedAt: "desc" },
      }),
      prisma.subscription.findFirst({
        where: { shopId, status: { in: ["active", "cancelled", "expired"] } },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.bundle.count({ where: { shopId, status: "active" } }),
    ]);

  let [pending, active, latest, activeBundles] = await readState();
  if (pending.length > 0) {
    try {
      const gateway = await openBillingGateway(shopId);
      for (const row of pending) await syncSubscription(shopId, row.shopifyChargeId, gateway);
    } catch (error) {
      verification = "unavailable";
      logEvent("error", "billing_pending_check_failed", { shopId, ...errorFields(error) });
    }
    [pending, active, latest, activeBundles] = await readState();
  }
  // What is still waiting is the newest pending row (the list is newest first).
  const stillPending = pending[0] ?? null;

  const plan: PlanId = active && isPlanId(active.plan) ? active.plan : "free";
  const subscription = active ?? latest;
  const limit = activeBundleLimit(plan);

  return {
    plan,
    status: subscription?.status ?? "active",
    subscription: subscription ? toSummary(subscription) : null,
    pendingPlan:
      stillPending && stillPending.plan !== "free" ? (stillPending.plan as PaidPlanId) : null,
    verification,
    features: { ...PLANS[plan].features },
    usage: {
      activeBundles,
      activeBundleLimit: limit,
      overLimit: limit !== null && activeBundles > limit,
    },
  };
}
