import { Lock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BundleWizard } from "@/components/dashboard/BundleWizard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { bundleToWizardState } from "@/components/dashboard/wizard/types";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/errors";
import { bundleIdSchema } from "@/lib/bundles/validation";
import { requireAuthenticatedShop } from "@/lib/dashboard/auth";
import { getBundle } from "@/services/bundles/get";
import { getTemplateForBundle, listTemplates } from "@/services/templates/templates";

export default async function EditBundlePage({ params }: { params: Promise<{ id: string }> }) {
  const shop = await requireAuthenticatedShop();
  const { id } = await params;
  if (!bundleIdSchema.safeParse(id).success) notFound();

  // Scoped to the authenticated shop; another shop's bundle is a plain 404.
  const bundle = await getBundle(shop.id, id).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });

  if (bundle.status === "active") {
    return (
      <div className="space-y-6">
        <PageHeader title={bundle.title} description="This bundle is live." />
        <EmptyState
          icon={Lock}
          title="Active bundles can't be edited"
          description="Deactivate this bundle from the bundles list first, then you can make changes and publish it again."
          action={
            <Button asChild>
              <Link href="/dashboard/bundles">Back to bundles</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const templates = await listTemplates();
  // A bundle may point at a template that has since been retired: name it, never drop the link.
  const saved = bundle.templateId ? await getTemplateForBundle(bundle.templateId) : null;
  const retiredTemplateName =
    saved && !templates.some((template) => template.id === saved.template.id)
      ? saved.template.name
      : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Edit bundle" description={bundle.title} />
      <BundleWizard
        templates={templates}
        bundleId={bundle.id}
        initialState={bundleToWizardState(bundle)}
        retiredTemplateName={retiredTemplateName}
      />
    </div>
  );
}
