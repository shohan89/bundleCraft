import { AnalyticsDashboard } from "@/components/dashboard/AnalyticsDashboard";
import { UpgradePrompt } from "@/components/dashboard/UpgradePrompt";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { requireAuthenticatedShop } from "@/lib/dashboard/auth";
import { prisma } from "@/lib/prisma";
import { hasFeatureAccess } from "@/services/billing/access";

export default async function AnalyticsPage() {
  const shop = await requireAuthenticatedShop();
  // Server-enforced plan gate (the API refuses too); this page just explains it.
  if (!(await hasFeatureAccess(shop.id, "analytics"))) {
    return (
      <div className="space-y-8">
        <PageHeader title="Analytics" description="Track how your bundles are performing." />
        <UpgradePrompt
          title="Analytics is part of the Growth plan"
          description="Upgrade to see views, adds, purchases, revenue and conversion for your bundles. We keep collecting the data in the meantime."
        />
      </div>
    );
  }
  // Only the shop's own bundles are offered in the filter; the numbers themselves
  // are fetched by the client from GET /api/analytics/overview (session-scoped).
  const bundles = await prisma.bundle.findMany({
    where: { shopId: shop.id },
    orderBy: { title: "asc" },
    select: { id: true, title: true },
  });

  return (
    <div className="space-y-8">
      <PageHeader title="Analytics" description="Track how your bundles are performing." />
      <AnalyticsDashboard bundles={bundles} />
    </div>
  );
}
