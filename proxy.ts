import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

/**
 * Protects merchant-only routes. This runs in the Edge runtime, so it must
 * never import Prisma (lib/prisma.ts uses the Node-only `pg` driver) — it
 * only checks the session cookie's signature and expiry.
 *
 * This is a fast pre-filter, not the authoritative check: it does NOT
 * confirm the shop is still active (e.g. hasn't uninstalled the app).
 * Route handlers behind this middleware must still call
 * `getAuthenticatedShop` from lib/auth/shopify-auth.ts, which re-verifies
 * the token AND checks the live Shop record, before trusting the
 * request's shop identity.
 */
export const config = {
  matcher: ["/dashboard/:path*", "/api/bundles/:path*", "/api/analytics/:path*", "/api/settings/:path*"],
};

export async function proxy(request: NextRequest) {
  const isApiRoute = request.nextUrl.pathname.startsWith("/api/");
  const sessionSecret = process.env.SESSION_SECRET;

  if (!sessionSecret) {
    console.error("SESSION_SECRET is not configured");
    return isApiRoute
      ? NextResponse.json({ error: "Authentication is not configured" }, { status: 500 })
      : NextResponse.redirect(new URL("/api/auth/shopify", request.url));
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const payload = token ? await verifySessionToken(token, sessionSecret) : null;

  if (!payload) {
    if (isApiRoute) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const installUrl = new URL("/api/auth/shopify", request.url);
    const shop = request.nextUrl.searchParams.get("shop");
    if (shop) installUrl.searchParams.set("shop", shop);
    return NextResponse.redirect(installUrl);
  }

  return NextResponse.next();
}
