import { NextRequest, NextResponse } from "next/server";
import { InvalidShopError, MissingConfigError, startOAuth } from "@/lib/auth/shopify-auth";
import { OAUTH_STATE_COOKIE_NAME, OAUTH_STATE_MAX_AGE_SECONDS } from "@/lib/auth/session";

/**
 * OAuth start. Shopify (or the App Store install link) hits this with
 * `?shop=<store>.myshopify.com`; we validate the domain, generate an
 * anti-CSRF state value, and redirect to Shopify's authorize screen.
 */
export async function GET(request: NextRequest) {
  const shop = request.nextUrl.searchParams.get("shop");

  try {
    const { authorizeUrl, state } = startOAuth(shop);

    const response = NextResponse.redirect(authorizeUrl);
    response.cookies.set(OAUTH_STATE_COOKIE_NAME, state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
      path: "/",
    });
    return response;
  } catch (error) {
    if (error instanceof InvalidShopError) {
      return NextResponse.json({ error: "Missing or invalid shop parameter" }, { status: 400 });
    }
    if (error instanceof MissingConfigError) {
      console.error("Shopify auth misconfiguration:", error.message);
      return NextResponse.json({ error: "Authentication is not configured" }, { status: 500 });
    }
    console.error("Unexpected error starting Shopify OAuth", error);
    return NextResponse.json({ error: "Unexpected authentication error" }, { status: 500 });
  }
}
