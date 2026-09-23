import { NextRequest, NextResponse } from "next/server";
import {
  InvalidShopError,
  MissingConfigError,
  requiredEnv,
  startOAuth,
} from "@/lib/auth/shopify-auth";
import { OAUTH_STATE_COOKIE_NAME, OAUTH_STATE_MAX_AGE_SECONDS } from "@/lib/auth/session";

/**
 * OAuth start. Shopify (or the App Store install link) hits this with
 * `?shop=<store>.myshopify.com`; we validate the domain, generate an
 * anti-CSRF state value, and redirect to Shopify's authorize screen.
 *
 * Merchants normally reach this from inside the Shopify Admin iframe. The
 * anti-CSRF state cookie set below needs to survive until the callback,
 * which browsers don't reliably guarantee for a cookie set/read entirely
 * within a cross-site iframe's own navigation — only for a real top-level
 * browser navigation. So on first hit we return a tiny HTML page that
 * forces `window.top.location` to this same URL (with `top_level=1`)
 * before doing anything else. If we're not actually embedded,
 * `window.top === window.self` and this is a no-op extra hop.
 */
export async function GET(request: NextRequest) {
  const shop = request.nextUrl.searchParams.get("shop");
  const isTopLevel = request.nextUrl.searchParams.get("top_level") === "1";

  if (!isTopLevel) {
    // Built from SHOPIFY_APP_URL, not request.url — behind a tunnel or
    // reverse proxy, request.url reflects the internal connection address
    // (e.g. localhost), not the public host the browser needs to reach.
    let appUrl: string;
    try {
      appUrl = requiredEnv("SHOPIFY_APP_URL");
    } catch {
      console.error("SHOPIFY_APP_URL is not configured");
      return NextResponse.json({ error: "Authentication is not configured" }, { status: 500 });
    }
    const bounceUrl = new URL(request.nextUrl.pathname + request.nextUrl.search, appUrl);
    bounceUrl.searchParams.set("top_level", "1");
    return new NextResponse(
      `<!doctype html><html><head><meta charset="utf-8"></head><body><script>window.top.location.href = ${JSON.stringify(bounceUrl.toString())};</script></body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

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
