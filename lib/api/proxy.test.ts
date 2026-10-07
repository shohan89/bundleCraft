// @vitest-environment node
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { config, proxy } from "@/proxy";

const SECRET = "test-secret-with-more-than-thirty-two-characters-1234";
const API_KEY = "a0aa30cd251a62b6dcacbfa52cf5bc10";
const API_SECRET = "the-shopify-client-secret";
afterEach(() => vi.unstubAllEnvs());

const request = (path: string, cookie?: string, authorization?: string) =>
  new NextRequest(`https://app.example.com${path}`, {
    headers: {
      ...(cookie ? { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } : {}),
      ...(authorization ? { authorization } : {}),
    },
  });

const base64url = (bytes: Buffer) =>
  bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const encode = (value: unknown) => base64url(Buffer.from(JSON.stringify(value)));

/** A Shopify embedded-app session token, or a deliberately broken one via `over`/`secret`. */
function sessionToken(over: Record<string, unknown> = {}, secret = API_SECRET) {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    iss: "https://a.myshopify.com/admin",
    dest: "https://a.myshopify.com",
    aud: API_KEY,
    sub: "1",
    exp: now + 60,
    nbf: now - 5,
    iat: now - 5,
    jti: "11111111-1111-1111-1111-111111111111",
    ...over,
  });
  const sig = base64url(createHmac("sha256", secret).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

describe("edge session filter (proxy.ts)", () => {
  it("covers every merchant surface and none of the public ones", () => {
    const matcher = config.matcher.join(" ");
    for (const path of [
      "/dashboard",
      "/api/bundles",
      "/api/analytics",
      "/api/products",
      "/api/templates",
      "/api/billing/create",
    ]) {
      expect(matcher, path).toContain(path);
    }
    for (const publicPath of [
      "/api/storefront",
      "/api/webhooks",
      "/api/auth",
      "/api/health",
      "/api/billing/callback",
    ]) {
      expect(matcher, publicPath).not.toContain(publicPath);
    }
  });

  it("answers an API request without a valid session with 401 in the shared envelope, never cached", async () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    for (const cookie of [undefined, "garbage", "a.b.c"]) {
      const response = await proxy(request("/api/bundles", cookie));
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required." },
      });
    }
  });

  it("sends a page request without a session to sign-in, keeping the shop hint", async () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const response = await proxy(request("/dashboard?shop=a.myshopify.com"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/api/auth/shopify");
    expect(location.searchParams.get("shop")).toBe("a.myshopify.com");
  });

  it("lets a request with a valid session through", async () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const token = await createSessionToken({ shopId: "s1", shopDomain: "a.myshopify.com" }, SECRET);
    const response = await proxy(request("/api/bundles", token));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("lets an API request through on a valid bearer session token alone, no cookie needed", async () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.stubEnv("SHOPIFY_API_KEY", API_KEY);
    vi.stubEnv("SHOPIFY_API_SECRET", API_SECRET);
    const response = await proxy(request("/api/bundles", undefined, `Bearer ${sessionToken()}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("a present but invalid bearer token is refused even alongside a valid cookie", async () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.stubEnv("SHOPIFY_API_KEY", API_KEY);
    vi.stubEnv("SHOPIFY_API_SECRET", API_SECRET);
    const cookie = await createSessionToken(
      { shopId: "s1", shopDomain: "a.myshopify.com" },
      SECRET,
    );
    for (const bad of [
      `Bearer ${sessionToken({}, "wrong-secret")}`, // forged
      `Bearer ${sessionToken({ exp: Math.floor(Date.now() / 1000) - 5 })}`, // expired
      `Bearer ${sessionToken({ aud: "someone-elses-app" })}`, // wrong audience
      "Bearer not-a-token",
    ]) {
      const response = await proxy(request("/api/bundles", cookie, bad));
      expect(response.status, bad).toBe(401);
    }
  });

  it("falls back to the cookie only when the request carries no bearer token", async () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    const cookie = await createSessionToken(
      { shopId: "s1", shopDomain: "a.myshopify.com" },
      SECRET,
    );
    const response = await proxy(request("/api/bundles", cookie));
    expect(response.status).toBe(200);
  });

  it("a bearer token is refused (not silently ignored) when Shopify's credentials are not configured", async () => {
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.stubEnv("SHOPIFY_API_KEY", "");
    vi.stubEnv("SHOPIFY_API_SECRET", "");
    const cookie = await createSessionToken(
      { shopId: "s1", shopDomain: "a.myshopify.com" },
      SECRET,
    );
    const response = await proxy(request("/api/bundles", cookie, `Bearer ${sessionToken()}`));
    expect(response.status).toBe(401); // the token can't be checked, so it isn't trusted, and the (valid) cookie is not consulted either
  });

  it("refuses everything, uncached and without detail, when the secret is not configured", async () => {
    vi.stubEnv("SESSION_SECRET", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await proxy(request("/api/bundles"));
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(await response.json())).not.toMatch(/SESSION_SECRET/);
  });
});
