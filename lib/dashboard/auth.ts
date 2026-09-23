import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAuthenticatedShop, type AuthenticatedShop } from "@/lib/auth/shopify-auth";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

/**
 * The single source of truth for "who is the authenticated merchant" on
 * every dashboard page. Wrapped in React's `cache()` so calling this from
 * both `app/dashboard/layout.tsx` and a nested page in the same request
 * only re-verifies the session once.
 *
 * proxy.ts already blocks unauthenticated requests to /dashboard/* at the
 * edge, but it can't check the database (Edge runtime, no `pg`). This is
 * the authoritative check: it re-verifies the session signature AND the
 * live Shop record, so a shop that uninstalled the app (status flipped to
 * inactive) is rejected here even with an otherwise-valid cookie.
 *
 * Never pass a shop id/domain from the client into this — identity comes
 * only from the server-verified session cookie.
 */
export const requireAuthenticatedShop = cache(async (): Promise<AuthenticatedShop> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const shop = await getAuthenticatedShop(token);

  if (!shop) {
    redirect("/api/auth/shopify");
  }

  return shop;
});
