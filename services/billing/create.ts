import { requiredEnv } from "@/lib/auth/shopify-auth";
import { billingCreationFailed, subscriptionAlreadyActive } from "@/lib/billing/errors";
import { billingTerms, getPlan } from "@/lib/billing/plans";
import type { CreateBillingResponse, PaidPlanId } from "@/lib/billing/types";
import { prisma } from "@/lib/prisma";
import { openBillingGateway } from "./gateway";
import { lockShopBilling } from "./lock";
import { toBillingError } from "./subscriptions";

/** How long an unapproved request for the same plan is reused instead of creating another charge. */
const RESUME_WINDOW_MS = 30 * 60 * 1000;

/**
 * Charges are real money once approved, so the default is a Shopify TEST
 * charge (approval page works, nothing is billed). Set SHOPIFY_BILLING_LIVE=true
 * in production to create real charges.
 */
export const isBillingTestMode = (): boolean => process.env.SHOPIFY_BILLING_LIVE !== "true";

/**
 * POST /api/billing/create. Starts (or resumes) a Shopify subscription for a
 * paid plan and returns Shopify's approval URL. Nothing about the shop's plan
 * changes here: the plan only changes after the merchant approves at Shopify
 * and the server reads the subscription back (services/billing/subscriptions.ts).
 *
 * `shop` is the authenticated session's shop; the amount is the server's plan
 * config, never anything the client sent. The whole decision runs under a
 * per-shop lock, so a double click or retry finds the first request's pending
 * subscription and returns the same approval URL rather than creating a
 * second charge.
 */
export async function createSubscription(
  shop: { id: string; shopDomain: string },
  plan: PaidPlanId,
): Promise<CreateBillingResponse> {
  try {
    const terms = billingTerms(plan);
    const returnUrl = `${requiredEnv("SHOPIFY_APP_URL").replace(/\/+$/, "")}/api/billing/callback`;

    return await prisma.$transaction(
      async (tx) => {
        await lockShopBilling(tx, shop.id);

        const active = await tx.subscription.findFirst({
          where: { shopId: shop.id, status: "active" },
        });
        if (active?.plan === plan) throw subscriptionAlreadyActive(getPlan(plan).name);

        const resumable = await tx.subscription.findFirst({
          where: {
            shopId: shop.id,
            status: "pending",
            plan,
            confirmationUrl: { not: null },
            createdAt: { gte: new Date(Date.now() - RESUME_WINDOW_MS) },
          },
          orderBy: { createdAt: "desc" },
        });
        if (resumable?.confirmationUrl) {
          return { confirmationUrl: resumable.confirmationUrl, plan, resumed: true };
        }

        const test = isBillingTestMode();
        const gateway = await openBillingGateway(shop.id);
        const charge = await gateway.createSubscription({ ...terms, returnUrl, test });

        await tx.subscription.create({
          data: {
            shopId: shop.id,
            shopifyChargeId: charge.id,
            plan,
            status: "pending",
            confirmationUrl: charge.confirmationUrl,
            isTest: test,
          },
        });
        return { confirmationUrl: charge.confirmationUrl, plan, resumed: false };
      },
      { timeout: 25_000, maxWait: 10_000 },
    );
  } catch (error) {
    throw toBillingError(error, billingCreationFailed, { shopId: shop.id, plan });
  }
}
