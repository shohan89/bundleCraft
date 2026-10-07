/**
 * Shopify webhook authentication. Shopify signs the raw request body with
 * the app secret (HMAC-SHA256, base64) in `X-Shopify-Hmac-Sha256`. Only a
 * body that verifies is trusted, and only then are the shop-domain header
 * and the payload used at all.
 * https://shopify.dev/docs/apps/build/webhooks/subscribe/https#step-5-verify-the-webhook
 */
import { hmacHex, timingSafeEqual } from "@/lib/auth/crypto";

function base64ToHex(value: string): string | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  try {
    return Array.from(atob(value), (char) => char.charCodeAt(0).toString(16).padStart(2, "0")).join(
      "",
    );
  } catch {
    return null;
  }
}

export async function verifyWebhookHmac(
  rawBody: string,
  hmacHeader: string | null,
  apiSecret: string,
): Promise<boolean> {
  if (!hmacHeader) return false;
  const provided = base64ToHex(hmacHeader);
  if (!provided) return false;
  return timingSafeEqual(await hmacHex(apiSecret, rawBody), provided);
}
