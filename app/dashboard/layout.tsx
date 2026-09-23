import type { Metadata } from "next";
import Script from "next/script";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { requireAuthenticatedShop } from "@/lib/dashboard/auth";

export const metadata: Metadata = {
  title: "Dashboard – BundleCraft",
  // The Shopify client ID is not a secret (it's already public in the
  // OAuth redirect URL) — only SHOPIFY_API_SECRET must never be exposed.
  other: { "shopify-api-key": process.env.SHOPIFY_API_KEY ?? "" },
};

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  // Authoritative auth check — see lib/dashboard/auth.ts. proxy.ts already
  // blocked unauthenticated requests at the edge; this also re-verifies
  // the live Shop record (catches uninstalled shops).
  const shop = await requireAuthenticatedShop();

  return (
    <>
      {/* Required for this app to render inside the Shopify Admin iframe. */}
      <Script
        src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
        strategy="afterInteractive"
      />
      <DashboardShell shopDomain={shop.shopDomain}>{children}</DashboardShell>
    </>
  );
}
