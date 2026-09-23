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
import { OAUTH_STATE_COOKIE_NAME, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/session";

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

    // Built from our own configured app URL, not request.nextUrl.origin —
    // behind a tunnel or reverse proxy (Cloudflare, Vercel, etc.) the
    // request's perceived origin is the internal connection address, not
    // the public one, and would send the merchant's browser to a URL that
    // doesn't actually reach us.
    const appUrl = requiredEnv("SHOPIFY_APP_URL");
    const response = NextResponse.redirect(
      new URL(`/dashboard?shop=${encodeURIComponent(shopDomain)}`, appUrl),
    );
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
