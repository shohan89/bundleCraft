// @vitest-environment node
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookHmac } from "./webhooks";

const SECRET = "test-secret";
const sign = (body: string, secret = SECRET) =>
  createHmac("sha256", secret).update(body).digest("base64");

describe("verifyWebhookHmac", () => {
  const body = JSON.stringify({ id: 1, line_items: [] });

  it("accepts Shopify's base64 HMAC of the exact raw body", async () => {
    expect(await verifyWebhookHmac(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a tampered body, a wrong secret, and a missing or malformed header", async () => {
    expect(await verifyWebhookHmac(body + " ", sign(body), SECRET)).toBe(false);
    expect(await verifyWebhookHmac(body, sign(body, "other"), SECRET)).toBe(false);
    expect(await verifyWebhookHmac(body, null, SECRET)).toBe(false);
    expect(await verifyWebhookHmac(body, "", SECRET)).toBe(false);
    expect(await verifyWebhookHmac(body, "not base64!!", SECRET)).toBe(false);
    expect(await verifyWebhookHmac(body, sign(body).slice(0, -4), SECRET)).toBe(false);
  });
});
