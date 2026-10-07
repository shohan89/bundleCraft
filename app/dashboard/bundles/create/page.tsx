import { BundleWizard } from "@/components/dashboard/BundleWizard";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { requireAuthenticatedShop } from "@/lib/dashboard/auth";
import { listTemplates } from "@/services/templates/templates";

export default async function CreateBundlePage() {
  // Auth check only: templates are application-owned and shared by every shop (seeded from
  // lib/templates/catalog.ts), not shop-scoped, so nothing else here needs the shop record.
  await requireAuthenticatedShop();
  const templates = await listTemplates();

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
