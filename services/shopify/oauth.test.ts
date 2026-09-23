import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OAuthTokenExchangeError,
  SHOPIFY_SCOPES,
  buildAuthorizeUrl,
  exchangeCodeForAccessToken,
  isValidShopDomain,
  verifyOAuthHmac,
} from "./oauth";

describe("isValidShopDomain", () => {
  it("accepts well-formed *.myshopify.com domains", () => {
    expect(isValidShopDomain("my-store123.myshopify.com")).toBe(true);
    expect(isValidShopDomain("a.myshopify.com")).toBe(true);
  });

  it("rejects non-Shopify hosts", () => {
    expect(isValidShopDomain("evil.com")).toBe(false);
    expect(isValidShopDomain("myshopify.com")).toBe(false);
  });

  it("rejects domain-confusion / injection attempts", () => {
    expect(isValidShopDomain("my-store.myshopify.com.evil.com")).toBe(false);
    expect(isValidShopDomain("my-store.myshopify.com/../admin")).toBe(false);
    expect(isValidShopDomain("my-store.myshopify.com/path")).toBe(false);
    expect(isValidShopDomain("http://my-store.myshopify.com")).toBe(false);
    expect(isValidShopDomain("my-store.myshopify.com ")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(isValidShopDomain("")).toBe(false);
  });
});

describe("buildAuthorizeUrl", () => {
  it("targets the shop's admin/oauth/authorize endpoint with the required params", () => {
    const url = new URL(
      buildAuthorizeUrl({
        shop: "test-shop.myshopify.com",
        apiKey: "abc123",
        redirectUri: "https://app.example.com/api/auth/callback",
        state: "the-state-value",
      }),
    );

    expect(url.origin).toBe("https://test-shop.myshopify.com");
    expect(url.pathname).toBe("/admin/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("abc123");
    expect(url.searchParams.get("scope")).toBe(SHOPIFY_SCOPES.join(","));
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example.com/api/auth/callback");
    expect(url.searchParams.get("state")).toBe("the-state-value");
  });
});

/** Independent reference implementation of Shopify's OAuth HMAC algorithm, using Node's
 * built-in crypto module, so the test doesn't just re-verify the module under test against
 * itself. */
function referenceShopifyHmac(params: Record<string, string>, secret: string): string {
  const escape = (value: string) => value.replace(/%/g, "%25").replace(/&/g, "%26");
  const pairs = Object.entries(params).map(([key, value]) => `${escape(key)}=${escape(value)}`);
  pairs.sort();
  return createHmac("sha256", secret).update(pairs.join("&")).digest("hex");
}

describe("verifyOAuthHmac", () => {
  const secret = "shpss_test_secret";
  const baseParams = {
    code: "0907a61c0c8d55e99db179b68161bc00",
    shop: "test-shop.myshopify.com",
    state: "the-state-value",
    timestamp: "1409617684",
  };

  it("accepts a correctly signed query string", async () => {
    const hmac = referenceShopifyHmac(baseParams, secret);
    const query = new URLSearchParams({ ...baseParams, hmac });
    await expect(verifyOAuthHmac(query, secret)).resolves.toBe(true);
  });

  it("rejects a tampered parameter", async () => {
    const hmac = referenceShopifyHmac(baseParams, secret);
    const query = new URLSearchParams({ ...baseParams, shop: "attacker.myshopify.com", hmac });
    await expect(verifyOAuthHmac(query, secret)).resolves.toBe(false);
  });

  it("rejects the wrong secret", async () => {
    const hmac = referenceShopifyHmac(baseParams, secret);
    const query = new URLSearchParams({ ...baseParams, hmac });
    await expect(verifyOAuthHmac(query, "wrong-secret")).resolves.toBe(false);
  });

  it("rejects a missing hmac param", async () => {
    const query = new URLSearchParams(baseParams);
    await expect(verifyOAuthHmac(query, secret)).resolves.toBe(false);
  });
});

describe("exchangeCodeForAccessToken", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the access token and scope on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ access_token: "shpat_abc", scope: "read_products" }), {
          status: 200,
        }),
      ),
    );

    const result = await exchangeCodeForAccessToken({
      shop: "test-shop.myshopify.com",
      apiKey: "key",
      apiSecret: "secret",
      code: "code",
    });

    expect(result).toEqual({ accessToken: "shpat_abc", scope: "read_products" });
  });

  it("throws OAuthTokenExchangeError on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));

    await expect(
      exchangeCodeForAccessToken({
        shop: "test-shop.myshopify.com",
        apiKey: "key",
        apiSecret: "secret",
        code: "bad-code",
      }),
    ).rejects.toThrow(OAuthTokenExchangeError);
  });

  it("throws OAuthTokenExchangeError when the response is missing fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));

    await expect(
      exchangeCodeForAccessToken({
        shop: "test-shop.myshopify.com",
        apiKey: "key",
        apiSecret: "secret",
        code: "code",
      }),
    ).rejects.toThrow(OAuthTokenExchangeError);
  });
});
