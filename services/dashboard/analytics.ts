import { prisma } from "@/lib/prisma";

export interface AnalyticsSummary {
  revenue: number | null;
  orders: number;
  views: number;
  adds: number;
  conversionRate: number | null;
}

/**
 * Same honesty rule as services/dashboard/overview.ts: these tables are
 * real but currently empty because nothing writes AnalyticsEvent rows
 * until ACTION-008 builds the tracking engine. Zero/null here is the
 * correct current state, not a placeholder.
 */
export async function getAnalyticsSummary(shopId: string): Promise<AnalyticsSummary> {
  const [revenueAgg, orders, views, adds] = await Promise.all([
    prisma.analyticsEvent.aggregate({
      where: { shopId, eventType: "bundle_purchase" },
      _sum: { revenue: true },
    }),
    prisma.analyticsEvent.count({ where: { shopId, eventType: "bundle_purchase" } }),
    prisma.analyticsEvent.count({ where: { shopId, eventType: "bundle_view" } }),
    prisma.analyticsEvent.count({ where: { shopId, eventType: "bundle_add" } }),
  ]);

  return {
    revenue: revenueAgg._sum.revenue ? revenueAgg._sum.revenue.toNumber() : null,
    orders,
    views,
    adds,
    conversionRate: views > 0 ? orders / views : null,
  };
}
