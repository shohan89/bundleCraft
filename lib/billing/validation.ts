/**
 * Billing input validation. The only thing a client may say is *which plan*
 * it wants. There is no price, amount, shop id or status field: the server
 * derives all of those, and any extra key is rejected.
 */
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { invalidPlan } from "./errors";
import { isPaidPlanId } from "./plans";
import type { PaidPlanId } from "./types";

const bodySchema = z.object({ plan: z.string() }).strict();

export function parseCreateBillingBody(body: unknown): { plan: PaidPlanId } {
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) throw new ApiError("INVALID_REQUEST", "Invalid request.", 400);
  if (!isPaidPlanId(parsed.data.plan)) throw invalidPlan();
  return { plan: parsed.data.plan };
}

/** Shopify appends `charge_id` (a number) to the return URL. */
export function parseChargeId(raw: string | null): string | null {
  return raw !== null && /^\d{1,20}$/.test(raw) ? `gid://shopify/AppSubscription/${raw}` : null;
}
