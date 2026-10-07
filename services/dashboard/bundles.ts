import { prisma } from "@/lib/prisma";
import { resolveCatalogRefs } from "@/services/products/validate";
import type { Money } from "@/lib/analytics/types";
import type { BundleStatus, BundleType } from "@/lib/generated/prisma/client";

export interface BundleListItem {
  id: string;
  title: string;
  bundleType: BundleType;
  status: BundleStatus;
  createdAt: Date;
  /** Purchase revenue for this bundle, one entry per currency. Empty if no purchases recorded yet. */
  revenue: Money[];
  /** Products in this bundle that are gone from (or unknown to) the synced Shopify catalog. */
  productIssues: number;
}

/**
 * Read-only listing for the dashboard table. No create/update/delete
 * logic here — that's ACTION-005's bundle engine.
 */
export async function listBundlesForShop(shopId: string): Promise<BundleListItem[]> {
  // Bundles (with their product references, in one joined statement) and the shop's purchase
  // revenue per bundle are independent, so they are read at the same time.
  const [bundles, revenueRows] = await Promise.all([
    prisma.bundle.findMany({
      where: { shopId },
      orderBy: { createdAt: "desc" },
      relationLoadStrategy: "join",
      select: {
        id: true,
        title: true,
        bundleType: true,
        status: true,
        createdAt: true,
        bundleProducts: { select: { shopifyProductId: true, shopifyVariantId: true } },
      },
    }),
    prisma.analyticsEvent.groupBy({
      by: ["bundleId", "currency"],
      where: { shopId, eventType: "bundle_purchase", currency: { not: null } },
      _sum: { revenue: true },
    }),
  ]);

  if (bundles.length === 0) {
    return [];
  }

  const revenueByBundleId = new Map<string, Money[]>();
  for (const row of revenueRows) {
    if (!row.currency || !row._sum.revenue) continue;
    const list = revenueByBundleId.get(row.bundleId) ?? [];
    list.push({ currency: row.currency, amount: row._sum.revenue.toNumber() });
    revenueByBundleId.set(row.bundleId, list);
  }

  // One lookup for every product of every listed bundle (no per-bundle queries).
  const refs = bundles.flatMap((bundle) =>
    bundle.bundleProducts.map((product) => ({ bundleId: bundle.id, ...product })),
  );
  const resolved = await resolveCatalogRefs(shopId, refs);
  const issuesByBundle = new Map<string, number>();
  refs.forEach((ref, index) => {
    const availability = resolved[index].availability;
    if (availability === "unavailable" || availability === "unknown") {
      issuesByBundle.set(ref.bundleId, (issuesByBundle.get(ref.bundleId) ?? 0) + 1);
    }
  });

  return bundles.map((bundle) => ({
    id: bundle.id,
    title: bundle.title,
    bundleType: bundle.bundleType,
    status: bundle.status,
    createdAt: bundle.createdAt,
    revenue: revenueByBundleId.get(bundle.id) ?? [],
    productIssues: issuesByBundle.get(bundle.id) ?? 0,
  }));
}
