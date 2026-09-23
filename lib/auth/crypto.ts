/**
 * Low-level crypto primitives for the authentication layer, built entirely
 * on Web Crypto (`crypto.subtle`) so this file works unmodified in both the
 * Node.js runtime (API routes) and the Edge runtime (proxy.ts).
 *
 * Two distinct key domains are derived (via HKDF) from a single
 * SESSION_SECRET so a leak of one purpose's key doesn't compromise the
 * other:
 *  - "session"           -> HMAC key that signs/verifies session cookies.
 *  - "token-encryption"   -> AES-GCM key that encrypts Shopify access
 *                            tokens at rest in the `shops.access_token`
 *                            column.
 *
 * Shopify's own OAuth HMAC (verifying the callback query string) is a
 * *separate* primitive: Shopify's spec requires signing with the raw API
 * secret directly, not a derived key, so `hmacHex` is exposed for that.
 */

function getEncoder() {
  return new TextEncoder();
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function importBaseKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", getEncoder().encode(secret), "HKDF", false, [
    "deriveKey",
  ]);
}

/** Derives a purpose-bound HMAC-SHA256 signing key from SESSION_SECRET. */
export async function deriveSigningKey(secret: string, purpose: string): Promise<CryptoKey> {
  const baseKey = await importBaseKey(secret);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info: getEncoder().encode(purpose) },
    baseKey,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign", "verify"],
  );
}

/** Derives a purpose-bound AES-256-GCM key from SESSION_SECRET. */
export async function deriveEncryptionKey(secret: string, purpose: string): Promise<CryptoKey> {
  const baseKey = await importBaseKey(secret);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info: getEncoder().encode(purpose) },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function signBase64Url(key: CryptoKey, data: string): Promise<string> {
  const signature = await crypto.subtle.sign("HMAC", key, getEncoder().encode(data));
  return base64UrlEncode(new Uint8Array(signature));
}

export async function verifyBase64Url(
  key: CryptoKey,
  data: string,
  signature: string,
): Promise<boolean> {
  try {
    return await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecode(signature),
      getEncoder().encode(data),
    );
  } catch {
    return false;
  }
}

/** AES-256-GCM encrypt. Output: base64url(iv) + "." + base64url(ciphertext+tag). */
export async function encryptString(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    getEncoder().encode(plaintext),
  );
  return `${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(ciphertext))}`;
}

export async function decryptString(key: CryptoKey, payload: string): Promise<string> {
  const [ivPart, ciphertextPart] = payload.split(".");
  if (!ivPart || !ciphertextPart) {
    throw new Error("Malformed encrypted payload");
  }
  const iv = base64UrlDecode(ivPart);
  const ciphertext = base64UrlDecode(ciphertextPart);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

/**
 * Plain HMAC-SHA256 hex digest using the raw secret as the key — required
 * by Shopify's OAuth callback HMAC verification (Shopify signs with the
 * app's API secret directly, not a derived key).
 */
export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    getEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, getEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
