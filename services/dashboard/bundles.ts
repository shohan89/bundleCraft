import { prisma } from "@/lib/prisma";
import type { BundleStatus, BundleType } from "@/lib/generated/prisma/client";

export interface BundleListItem {
  id: string;
  title: string;
  bundleType: BundleType;
  status: BundleStatus;
  createdAt: Date;
  /** Sum of purchase-event revenue for this bundle. `null` if no purchases recorded yet. */
  revenue: number | null;
}

/**
 * Read-only listing for the dashboard table. No create/update/delete
 * logic here — that's ACTION-005's bundle engine.
 */
export async function listBundlesForShop(shopId: string): Promise<BundleListItem[]> {
  const bundles = await prisma.bundle.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
  });

  if (bundles.length === 0) {
    return [];
  }

  const revenueRows = await prisma.analyticsEvent.groupBy({
    by: ["bundleId"],
    where: {
      shopId,
      eventType: "bundle_purchase",
      bundleId: { in: bundles.map((bundle) => bundle.id) },
    },
    _sum: { revenue: true },
  });

  const revenueByBundleId = new Map(
    revenueRows.map((row) => [row.bundleId, row._sum.revenue ? row._sum.revenue.toNumber() : null]),
  );

  return bundles.map((bundle) => ({
    id: bundle.id,
    title: bundle.title,
    bundleType: bundle.bundleType,
    status: bundle.status,
    createdAt: bundle.createdAt,
    revenue: revenueByBundleId.get(bundle.id) ?? null,
  }));
}
