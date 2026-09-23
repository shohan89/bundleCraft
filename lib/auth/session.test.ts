// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { SESSION_MAX_AGE_SECONDS, createSessionToken, verifySessionToken } from "./session";

const SECRET = "test-session-secret";

afterEach(() => {
  vi.useRealTimers();
});

describe("createSessionToken / verifySessionToken", () => {
  it("round-trips shop identity claims", async () => {
    const token = await createSessionToken(
      { shopId: "shop-a-id", shopDomain: "shop-a.myshopify.com" },
      SECRET,
    );
    const payload = await verifySessionToken(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload?.shopId).toBe("shop-a-id");
    expect(payload?.shopDomain).toBe("shop-a.myshopify.com");
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createSessionToken(
      { shopId: "shop-a-id", shopDomain: "shop-a.myshopify.com" },
      SECRET,
    );
    const payload = await verifySessionToken(token, "a-different-secret");
    expect(payload).toBeNull();
  });

  it("rejects a tampered token", async () => {
    const token = await createSessionToken(
      { shopId: "shop-a-id", shopDomain: "shop-a.myshopify.com" },
      SECRET,
    );
    const [payload, signature] = token.split(".");
    const tamperedPayload = payload.slice(0, -1) + (payload.at(-1) === "A" ? "B" : "A");
    const payloadTampered = await verifySessionToken(`${tamperedPayload}.${signature}`, SECRET);
    expect(payloadTampered).toBeNull();
  });

  it("rejects a malformed token", async () => {
    await expect(verifySessionToken("not-a-valid-token", SECRET)).resolves.toBeNull();
    await expect(verifySessionToken("", SECRET)).resolves.toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await createSessionToken(
      { shopId: "shop-a-id", shopDomain: "shop-a.myshopify.com" },
      SECRET,
    );

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + (SESSION_MAX_AGE_SECONDS + 60) * 1000);

    const payload = await verifySessionToken(token, SECRET);
    expect(payload).toBeNull();
  });

  it("never resolves shop A's token to shop B's identity", async () => {
    const tokenA = await createSessionToken(
      { shopId: "shop-a-id", shopDomain: "shop-a.myshopify.com" },
      SECRET,
    );
    const tokenB = await createSessionToken(
      { shopId: "shop-b-id", shopDomain: "shop-b.myshopify.com" },
      SECRET,
    );

    const payloadA = await verifySessionToken(tokenA, SECRET);
    const payloadB = await verifySessionToken(tokenB, SECRET);

    expect(payloadA?.shopId).toBe("shop-a-id");
    expect(payloadB?.shopId).toBe("shop-b-id");
    expect(payloadA?.shopId).not.toBe(payloadB?.shopId);
  });
});
