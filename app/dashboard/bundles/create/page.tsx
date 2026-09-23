import { BundleWizard } from "@/components/dashboard/BundleWizard";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedShop } from "@/lib/dashboard/auth";

export default async function CreateBundlePage() {
  // Auth check only — templates are shared/global (seeded in ACTION-002),
  // not shop-scoped, so nothing else here needs the shop record.
  await requireAuthenticatedShop();

  const templates = await prisma.template.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: { id: true, name: true, category: true },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create bundle"
        description="Build a new product bundle in a few guided steps."
      />
      <BundleWizard templates={templates} />
    </div>
  );
}
