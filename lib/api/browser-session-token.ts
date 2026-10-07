/**
 * Browser-side access to Shopify's embedded-app session token, so `apiRequest` can send an
 * `Authorization: Bearer` header the server verifies independently of the session cookie
 * (see lib/auth/session-token.ts and docs/07-AUTHENTICATION.md).
 *
 * App Bridge (loaded via the CDN script tag in app/dashboard/layout.tsx — no extra dependency)
 * exposes `window.shopify.idToken()`, returning a fresh, short-lived token each call; App
 * Bridge itself handles fetching and renewing it. Outside the embedded admin (App Bridge not
 * loaded — local development without a shop param, or a test environment) this quietly
 * returns `null` and every caller falls back to the cookie exactly as before, so nothing here
 * is required for the app to keep working.
 */

declare global {
  interface Window {
    shopify?: { idToken?: () => Promise<string> };
  }
}

export async function getBrowserSessionToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const bridge = window.shopify;
  if (!bridge || typeof bridge.idToken !== "function") return null;
  try {
    const token = await bridge.idToken();
    return typeof token === "string" && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}
