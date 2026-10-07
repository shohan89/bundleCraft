import type { BundleType } from "@/lib/bundles/types";
import type { BundleAvailability } from "./types";

/** What the synced catalog says about one product line; "unknown" = not in the catalog. */
export type LineState = "available" | "sold_out" | "unavailable" | "unknown";

/**
 * Availability of one bundle from its products' catalog state.
 * - fixed: every product is needed, so the worst state wins (unavailable, then sold out,
 *   then unknown).
 * - quantity / mix & match: the customer picks from a pool, so the best state wins (one
 *   buyable product is enough to open the bundle; the cart check enforces the counts).
 * This only decides what a card says. It never authorises a purchase: that is the cart
 * check's job.
 */
export function bundleAvailability(type: BundleType, states: LineState[]): BundleAvailability {
  if (states.length === 0) return "unknown";
  if (type === "fixed") {
    if (states.includes("unavailable")) return "unavailable";
    if (states.includes("sold_out")) return "sold_out";
    return states.includes("unknown") ? "unknown" : "available";
  }
  if (states.includes("available")) return "available";
  if (states.includes("unknown")) return "unknown";
  return states.includes("sold_out") ? "sold_out" : "unavailable";
}
