import { BillingPanel, type BillingFlash } from "@/components/dashboard/billing/BillingPanel";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { requireAuthenticatedShop } from "@/lib/dashboard/auth";
import { getBillingState } from "@/services/billing/subscriptions";

const FLASHES: readonly string[] = ["success", "declined", "pending", "error"];

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string }>;
}) {
  const shop = await requireAuthenticatedShop();
  const { billing } = await searchParams;
  // The banner is only a message; the numbers below always come from the verified server state.
  const flash = billing && FLASHES.includes(billing) ? (billing as BillingFlash) : null;
  const state = await getBillingState(shop.id);

  return (
    <div className="space-y-6">
      <PageHeader title="Billing" description="Your BundleCraft plan and subscription." />
      <BillingPanel initial={state} flash={flash} />
    </div>
  );
}
