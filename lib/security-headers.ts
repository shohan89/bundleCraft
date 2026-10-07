/**
 * Response headers for every route. Kept in one plain module so a test can
 * assert them and next.config.ts can apply them.
 *
 * `frame-ancestors` is what lets the dashboard load inside the Shopify admin
 * iframe while refusing to be framed by any other site (clickjacking). It is
 * used instead of X-Frame-Options, which cannot express "Shopify only".
 * A script-restricting CSP is deliberately not set here: Next.js inlines
 * scripts, so that needs per-request nonces and is tracked as future
 * hardening in docs/13-SECURITY.md.
 */
export const SECURITY_HEADERS: { key: string; value: string }[] = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors https://admin.shopify.com https://*.myshopify.com;",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];
