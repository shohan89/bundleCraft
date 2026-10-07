import type { MetricTotals } from "@/lib/analytics/types";
import { prisma } from "@/lib/prisma";
import { getTotals } from "@/services/analytics/queries";

export interface DashboardOverview {
  activeBundleCount: number;
  /** All-time totals from the analytics service. Zeros mean nothing has been recorded, not a placeholder. */
  totals: MetricTotals;
}

export interface RecentBundle {
  id: string;
  title: string;
  status: string;
  createdAt: Date;
}

/** Home-page summary: live bundle count plus the analytics totals, both scoped to `shopId`. */
export async function getDashboardOverview(shopId: string): Promise<DashboardOverview> {
  const [activeBundleCount, totals] = await Promise.all([
    prisma.bundle.count({ where: { shopId, status: "active" } }),
    getTotals(shopId),
  ]);
  return { activeBundleCount, totals };
}

export async function getRecentBundles(shopId: string, limit = 5): Promise<RecentBundle[]> {
  return prisma.bundle.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, title: true, status: true, createdAt: true },
  });
}
