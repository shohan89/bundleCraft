import { NextRequest, NextResponse } from "next/server";
import {
  InvalidOAuthHmacError,
  InvalidOAuthStateError,
  InvalidShopError,
  MissingConfigError,
  MissingOAuthCodeError,
  TokenExchangeFailedError,
  completeOAuth,
  requiredEnv,
} from "@/lib/auth/shopify-auth";
import {
  OAUTH_STATE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/session";

/**
 * OAuth callback. Validates Shopify's HMAC + our anti-CSRF state, exchanges
 * the authorization code for an access token, upserts the Shop record
 * (token encrypted at rest), and issues a session cookie. Never returns
 * the access token, API secret, or session secret in any response.
 */
export async function GET(request: NextRequest) {
  const expectedState = request.cookies.get(OAUTH_STATE_COOKIE_NAME)?.value;

  try {
    const { sessionToken, shopDomain } = await completeOAuth(
      request.nextUrl.searchParams,
      expectedState,
    );

    // We're on a genuine top-level navigation right now (see
    // app/api/auth/shopify/route.ts's iframe-breakout bounce) — not
    // embedded in the Shopify Admin iframe. Redirecting to our own
    // /dashboard here would leave the merchant outside the admin chrome.
    // Redirecting to this Shopify URL re-embeds the app properly; it then
    // loads application_url again with the session cookie set below,
    // which app/page.tsx sends on to /dashboard.
    const apiKey = requiredEnv("SHOPIFY_API_KEY");
    const response = NextResponse.redirect(`https://${shopDomain}/admin/apps/${apiKey}`);
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: true,
      // The dashboard is loaded inside a Shopify admin iframe, which makes
      // those requests cross-site from the browser's point of view — this
      // cookie must be sent on cross-site requests to survive that.
      sameSite: "none",
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: "/",
    });
    response.cookies.delete(OAUTH_STATE_COOKIE_NAME);
    return response;
  } catch (error) {
    if (
      error instanceof InvalidShopError ||
      error instanceof InvalidOAuthStateError ||
      error instanceof InvalidOAuthHmacError ||
      error instanceof MissingOAuthCodeError
    ) {
      return NextResponse.json({ error: "Invalid authentication request" }, { status: 400 });
    }
    if (error instanceof TokenExchangeFailedError) {
      return NextResponse.json(
        { error: "Failed to complete Shopify authentication" },
        { status: 502 },
      );
    }
    if (error instanceof MissingConfigError) {
      console.error("Shopify auth misconfiguration:", error.message);
      return NextResponse.json({ error: "Authentication is not configured" }, { status: 500 });
    }
    console.error("Unexpected error completing Shopify OAuth", error);
    return NextResponse.json({ error: "Unexpected authentication error" }, { status: 500 });
  }
}
