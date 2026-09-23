import { Package } from "lucide-react";
import Link from "next/link";
import { BundleTable } from "@/components/dashboard/BundleTable";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { requireAuthenticatedShop } from "@/lib/dashboard/auth";
import { listBundlesForShop } from "@/services/dashboard/bundles";

export default async function BundlesPage() {
  const shop = await requireAuthenticatedShop();
  const bundles = await listBundlesForShop(shop.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bundles"
        description="Manage the bundles you've created for your store."
        action={
          <Button asChild>
            <Link href="/dashboard/bundles/create">Create bundle</Link>
          </Button>
        }
      />

      {bundles.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No bundles yet"
          description="Bundles let you group products together at a discount to increase average order value. Create your first bundle to get started."
          action={
            <Button asChild>
              <Link href="/dashboard/bundles/create">Create your first bundle</Link>
            </Button>
          }
        />
      ) : (
        <BundleTable bundles={bundles} />
      )}
    </div>
  );
}
