import { prisma } from "@/lib/prisma";

export interface DashboardOverview {
  activeBundleCount: number;
  /** Sum of AnalyticsEvent.revenue for purchase events. `null` means no purchase data exists yet. */
  totalRevenue: number | null;
  orderCount: number;
  /** purchases / views. `null` means no view data exists yet (nothing to divide by). */
  conversionRate: number | null;
}

export interface RecentBundle {
  id: string;
  title: string;
  status: string;
  createdAt: Date;
}

/**
 * Reads from the tables ACTION-002 already created. There is no analytics
 * *engine* yet (nothing writes AnalyticsEvent rows until ACTION-008), so
 * these aggregates are honestly zero/null today — that's the correct,
 * non-fabricated state, not a placeholder. Once ACTION-008 starts writing
 * events, these same queries start returning real numbers with no page
 * changes required.
 */
export async function getDashboardOverview(shopId: string): Promise<DashboardOverview> {
  const [activeBundleCount, revenueAgg, orderCount, viewCount] = await Promise.all([
    prisma.bundle.count({ where: { shopId, status: "active" } }),
    prisma.analyticsEvent.aggregate({
      where: { shopId, eventType: "bundle_purchase" },
      _sum: { revenue: true },
    }),
    prisma.analyticsEvent.count({ where: { shopId, eventType: "bundle_purchase" } }),
    prisma.analyticsEvent.count({ where: { shopId, eventType: "bundle_view" } }),
  ]);

  return {
    activeBundleCount,
    totalRevenue: revenueAgg._sum.revenue ? revenueAgg._sum.revenue.toNumber() : null,
    orderCount,
    conversionRate: viewCount > 0 ? orderCount / viewCount : null,
  };
}

export async function getRecentBundles(shopId: string, limit = 5): Promise<RecentBundle[]> {
  return prisma.bundle.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, title: true, status: true, createdAt: true },
  });
}
