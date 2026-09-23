// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  decryptString,
  deriveEncryptionKey,
  deriveSigningKey,
  encryptString,
  hmacHex,
  randomToken,
  signBase64Url,
  timingSafeEqual,
  verifyBase64Url,
} from "./crypto";

describe("randomToken", () => {
  it("produces distinct, non-empty values", () => {
    const a = randomToken();
    const b = randomToken();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });
});

describe("HMAC signing (session key derivation)", () => {
  it("round-trips: sign then verify succeeds", async () => {
    const key = await deriveSigningKey("test-secret", "session");
    const signature = await signBase64Url(key, "hello");
    await expect(verifyBase64Url(key, "hello", signature)).resolves.toBe(true);
  });

  it("rejects a tampered payload", async () => {
    const key = await deriveSigningKey("test-secret", "session");
    const signature = await signBase64Url(key, "hello");
    await expect(verifyBase64Url(key, "goodbye", signature)).resolves.toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const key = await deriveSigningKey("test-secret", "session");
    const signature = await signBase64Url(key, "hello");
    const tampered = signature.slice(0, -1) + (signature.at(-1) === "A" ? "B" : "A");
    await expect(verifyBase64Url(key, "hello", tampered)).resolves.toBe(false);
  });

  it("derives a different key for a different purpose from the same secret", async () => {
    const sessionKey = await deriveSigningKey("test-secret", "session");
    const otherKey = await deriveSigningKey("test-secret", "token-encryption-hmac");
    const signature = await signBase64Url(sessionKey, "hello");
    await expect(verifyBase64Url(otherKey, "hello", signature)).resolves.toBe(false);
  });

  it("derives a different key for a different secret", async () => {
    const keyA = await deriveSigningKey("secret-a", "session");
    const keyB = await deriveSigningKey("secret-b", "session");
    const signature = await signBase64Url(keyA, "hello");
    await expect(verifyBase64Url(keyB, "hello", signature)).resolves.toBe(false);
  });
});

describe("AES-GCM encryption (access token at rest)", () => {
  it("round-trips plaintext", async () => {
    const key = await deriveEncryptionKey("test-secret", "token-encryption");
    const encrypted = await encryptString(key, "shpat_super_secret_token");
    expect(encrypted).not.toContain("shpat_super_secret_token");
    await expect(decryptString(key, encrypted)).resolves.toBe("shpat_super_secret_token");
  });

  it("produces a different ciphertext each time (random IV)", async () => {
    const key = await deriveEncryptionKey("test-secret", "token-encryption");
    const a = await encryptString(key, "same-plaintext");
    const b = await encryptString(key, "same-plaintext");
    expect(a).not.toEqual(b);
  });

  it("fails to decrypt with the wrong key", async () => {
    const keyA = await deriveEncryptionKey("secret-a", "token-encryption");
    const keyB = await deriveEncryptionKey("secret-b", "token-encryption");
    const encrypted = await encryptString(keyA, "sensitive");
    await expect(decryptString(keyB, encrypted)).rejects.toThrow();
  });

  it("fails to decrypt tampered ciphertext", async () => {
    const key = await deriveEncryptionKey("test-secret", "token-encryption");
    const encrypted = await encryptString(key, "sensitive");
    const [iv, ciphertext] = encrypted.split(".");
    const tampered = `${iv}.${ciphertext.slice(0, -2)}${ciphertext.slice(-2) === "AA" ? "BB" : "AA"}`;
    await expect(decryptString(key, tampered)).rejects.toThrow();
  });
});

describe("hmacHex (Shopify OAuth HMAC primitive)", () => {
  it("is deterministic for the same secret and message", async () => {
    const a = await hmacHex("api-secret", "code=123&shop=test.myshopify.com");
    const b = await hmacHex("api-secret", "code=123&shop=test.myshopify.com");
    expect(a).toEqual(b);
  });

  it("changes when the secret changes", async () => {
    const a = await hmacHex("api-secret-1", "same message");
    const b = await hmacHex("api-secret-2", "same message");
    expect(a).not.toEqual(b);
  });
});

describe("timingSafeEqual", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqual("abc123", "abc123")).toBe(true);
  });

  it("returns false for different strings of the same length", () => {
    expect(timingSafeEqual("abc123", "abc124")).toBe(false);
  });

  it("returns false for different-length strings", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});
