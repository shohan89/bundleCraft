import { CreditCard, LifeBuoy, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { requireAuthenticatedShop } from "@/lib/dashboard/auth";

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  growth: "Growth",
  pro: "Pro",
};

function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Store;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="px-5 py-5">
      <div className="flex items-start gap-3">
        <div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg">
          <Icon className="text-muted-foreground size-4" aria-hidden="true" />
        </div>
        <div className="flex-1 space-y-3">
          <div>
            <h2 className="text-foreground text-sm font-semibold">{title}</h2>
            <p className="text-muted-foreground text-sm">{description}</p>
          </div>
          {children}
        </div>
      </div>
    </Card>
  );
}

export default async function SettingsPage() {
  // Only shop.shopDomain/plan/status are read here — accessToken is
  // never fetched or displayed. See lib/auth/shopify-auth.ts.
  const shop = await requireAuthenticatedShop();

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage your store and application preferences." />

      <div className="space-y-4">
        <SettingsSection
          icon={Store}
          title="Store settings"
          description="Information about your connected Shopify store."
        >
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground text-xs font-medium">Store domain</dt>
              <dd className="text-foreground">{shop.shopDomain}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs font-medium">Plan</dt>
              <dd className="text-foreground">{PLAN_LABEL[shop.plan] ?? shop.plan}</dd>
            </div>
          </dl>
        </SettingsSection>

        <SettingsSection
          icon={CreditCard}
          title="Billing"
          description="Manage your BundleCraft subscription."
        >
          <Badge variant="outline">Billing management coming soon</Badge>
        </SettingsSection>

        <SettingsSection icon={LifeBuoy} title="Support" description="Get help with BundleCraft.">
          <p className="text-muted-foreground text-sm">Support resources will be available here.</p>
        </SettingsSection>
      </div>
    </div>
  );
}
