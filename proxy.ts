import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { bearerTokenFrom, verifyShopifySessionToken } from "@/lib/auth/session-token";

/**
 * Protects merchant-only routes. This runs in the Edge runtime, so it must
 * never import Prisma (lib/prisma.ts uses the Node-only `pg` driver) — it
 * only checks signatures and claims, cookie or bearer, never the database.
 *
 * This is a fast pre-filter, not the authoritative check: it does NOT
 * confirm the shop is still active (e.g. hasn't uninstalled the app), for
 * either credential. Route handlers behind this middleware must still call
 * `authenticateApiRequest` (lib/api/guard.ts) / `requireAuthenticatedShop`,
 * which re-verify the credential AND check the live Shop record, before
 * trusting the request's shop identity.
 *
 * A request may authenticate with EITHER the session cookie OR a Shopify
 * embedded-app session token (`Authorization: Bearer ...`) — the same two
 * credentials `authenticateApiRequest` accepts. Without this, a client
 * whose browser never sends the cookie (a blocked third-party cookie) but
 * does carry a valid bearer token would be turned away here before its
 * token was ever looked at.
 */
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/api/bundles/:path*",
    "/api/analytics/:path*",
    "/api/products/:path*",
    "/api/templates/:path*",
    // /api/billing/callback is deliberately NOT listed: Shopify's return redirect must reach
    // the route, which checks the session itself and redirects to sign-in if it is missing.
    "/api/billing/create",
    "/api/billing/current",
    "/api/billing/cancel",
    "/api/settings/:path*",
  ],
};

// Merchant data and auth failures must never be cached by a browser or shared cache.
const NO_STORE = { "Cache-Control": "no-store" };

export async function proxy(request: NextRequest) {
  const isApiRoute = request.nextUrl.pathname.startsWith("/api/");
  const sessionSecret = process.env.SESSION_SECRET;

  if (!sessionSecret) {
    console.error("SESSION_SECRET is not configured");
    return isApiRoute
      ? NextResponse.json(
          {
            success: false,
            error: { code: "INTERNAL_ERROR", message: "Authentication is not configured." },
          },
          { status: 500, headers: NO_STORE },
        )
      : NextResponse.redirect(new URL("/api/auth/shopify", request.url));
  }

  const cookieToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const bearer = bearerTokenFrom(request);
  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;

  // A bearer token, if the request carries one, is checked on its own and never falls back
  // to the cookie — the same rule authenticateApiRequest enforces authoritatively.
  const authenticated = bearer
    ? Boolean(
        apiKey &&
        apiSecret &&
        (await verifyShopifySessionToken(bearer, { apiKey, apiSecret })) !== null,
      )
    : cookieToken
      ? (await verifySessionToken(cookieToken, sessionSecret)) !== null
      : false;

  if (!authenticated) {
    if (isApiRoute) {
      // Same envelope as lib/api/response.ts so API clients see one error shape.
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required." } },
        { status: 401, headers: NO_STORE },
      );
    }
    const installUrl = new URL("/api/auth/shopify", request.url);
    const shop = request.nextUrl.searchParams.get("shop");
    if (shop) installUrl.searchParams.set("shop", shop);
    return NextResponse.redirect(installUrl);
  }

  return NextResponse.next();
}
