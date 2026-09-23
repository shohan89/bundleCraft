import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedShop } from "@/lib/auth/shopify-auth";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

/**
 * Entry point Shopify loads when embedding this app (application_url,
 * with `?shop=...&host=...` query params attached). Not a marketing
 * page — this is an embedded-only merchant tool, so root just routes to
 * the dashboard (authenticated) or OAuth install (not yet authenticated).
 *
 * The `shop` query param is only ever used to build the install URL —
 * never to decide who's authenticated. Identity comes solely from the
 * verified session cookie (see lib/auth/shopify-auth.ts).
 */
export default async function RootPage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const shop = typeof params.shop === "string" ? params.shop : undefined;

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const authenticatedShop = await getAuthenticatedShop(token);

  if (authenticatedShop) {
    redirect("/dashboard");
  }

  redirect(shop ? `/api/auth/shopify?shop=${encodeURIComponent(shop)}` : "/api/auth/shopify");
}
