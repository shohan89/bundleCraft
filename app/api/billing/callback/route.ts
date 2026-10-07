import { errorFields, logEvent } from "@/lib/log";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedShop, requiredEnv } from "@/lib/auth/shopify-auth";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { parseChargeId } from "@/lib/billing/validation";
import { prisma } from "@/lib/prisma";
import { syncSubscription } from "@/services/billing/subscriptions";

export type BillingReturn = "success" | "declined" | "pending" | "error";

/**
 * Where Shopify sends the merchant after the approval page (`?charge_id=...`).
 *
 * Nothing in the URL is believed. The charge id only names a subscription
 * *we* created for this session's shop; the outcome is whatever Shopify
 * itself reports when the server reads that subscription back (status, name
 * and price all checked against our plan config). Arriving here does not
 * activate anything, and a charge id belonging to another shop, or an
 * unknown one, does nothing at all. Refreshing or replaying the URL is
 * harmless: the sync is idempotent.
 *
 * The merchant always ends up on the billing page inside the Shopify admin.
 */
export async function GET(request: NextRequest) {
  const apiKey = requiredEnv("SHOPIFY_API_KEY");
  const session = await getAuthenticatedShop(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  const backTo = (shopDomain: string, result: BillingReturn) =>
    NextResponse.redirect(
      `https://${shopDomain}/admin/apps/${apiKey}/dashboard/billing?billing=${result}`,
    );

  if (!session) {
    // No usable session (expired, or blocked in this browser context): sign in again. The
    // billing page then verifies any pending subscription with Shopify by itself.
    return NextResponse.redirect(new URL("/api/auth/shopify", requiredEnv("SHOPIFY_APP_URL")));
  }

  const chargeId = parseChargeId(request.nextUrl.searchParams.get("charge_id"));
  if (!chargeId) return backTo(session.shopDomain, "error");

  try {
    // Scoped to the session's shop: someone else's charge id is "not found".
    const row = await prisma.subscription.findFirst({
      where: { shopId: session.id, shopifyChargeId: chargeId },
      select: { id: true },
    });
    if (!row) return backTo(session.shopDomain, "error");

    const settled = await syncSubscription(session.id, chargeId);
    const result: BillingReturn =
      settled.status === "active"
        ? "success"
        : settled.status === "pending"
          ? "pending"
          : "declined";
    return backTo(session.shopDomain, result);
  } catch (error) {
    logEvent("error", "billing_callback_failed", errorFields(error));
    return backTo(session.shopDomain, "error");
  }
}
