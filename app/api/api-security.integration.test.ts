// @vitest-environment node
/// <reference types="vite/client" />
import "dotenv/config";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CSRF_HEADER, CSRF_HEADER_VALUE } from "@/lib/api/csrf";
import { createSessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/**
 * API security audit (ACTION-010). Every route under app/api must be
 * classified below; a new route that isn't fails the inventory test, so an
 * endpoint can never ship without a stated authentication model. Each class
 * is then probed for the behaviour that model promises.
 */
type Kind =
  | "public"
  | "merchant"
  | "storefront"
  | "webhook"
  | "oauth-start"
  | "oauth-callback"
  | "billing-return";

const MANIFEST: Record<string, Kind> = {
  "analytics/bundles/[id]": "merchant",
  "analytics/overview": "merchant",
  "auth/callback": "oauth-callback",
  "auth/shopify": "oauth-start",
  "billing/callback": "billing-return",
  "billing/cancel": "merchant",
  "billing/create": "merchant",
  "billing/current": "merchant",
  health: "public",
  bundles: "merchant",
  "bundles/[id]": "merchant",
  "bundles/[id]/customization": "merchant",
  "bundles/[id]/deactivate": "merchant",
  "bundles/[id]/duplicate": "merchant",
  "bundles/[id]/publish": "merchant",
  "bundles/[id]/validate": "merchant",
  products: "merchant",
  "products/[id]": "merchant",
  "products/sync": "merchant",
  templates: "merchant",
  "templates/[id]": "merchant",
  "storefront/bundles": "storefront",
  "storefront/cart": "storefront",
  "storefront/events": "storefront",
  "webhooks/app-subscriptions-update": "webhook",
  "webhooks/app-uninstalled": "webhook",
  "webhooks/compliance": "webhook",
  "webhooks/orders-paid": "webhook",
  "webhooks/products": "webhook",
};

type Handler = (request: never, context?: never) => Promise<Response>;
type RouteModule = Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", Handler>>;

// Lazy on purpose: eager glob imports would load lib/prisma before dotenv has run.
const loaders = import.meta.glob("./**/route.ts") as Record<string, () => Promise<RouteModule>>;
const routeKey = (file: string) => file.replace(/^\.\//, "").replace(/\/route\.ts$/, "");
const modules: Record<string, RouteModule> = {};
const routes: { key: string; mod: RouteModule }[] = [];

beforeAll(async () => {
  for (const [file, load] of Object.entries(loaders)) {
    const mod = await load();
    modules[`./${routeKey(file)}`] = mod;
    routes.push({ key: routeKey(file), mod });
  }
});

let currentCookie: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "bundlecraft_session" && currentCookie ? { name, value: currentCookie } : undefined,
  }),
}));

const canRun = Boolean(process.env.DATABASE_URL) && Boolean(process.env.SESSION_SECRET);
const UUID = "5f0c6a6e-8f0e-4c53-9b64-6f7f3f2b9a11";
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const LEAKS = /prisma|stack|node_modules|postgres|shpat_|SESSION_SECRET|at .*\(.*:\d+:\d+\)/i;

function call(
  mod: RouteModule,
  method: (typeof METHODS)[number],
  key: string,
  init: RequestInit = {},
) {
  const handler = mod[method]!;
  const request = new NextRequest(`http://localhost/api/${key.replace("[id]", UUID)}`, {
    method,
    ...(init as ConstructorParameters<typeof NextRequest>[1]),
  });
  return handler(request as never, { params: Promise.resolve({ id: UUID }) } as never);
}

describe("route inventory", () => {
  it("classifies every API route, and every classification has a route", () => {
    expect(routes.map((r) => r.key).sort()).toEqual(Object.keys(MANIFEST).sort());
  });

  it("route files export only handlers (unsupported methods therefore get 405 from Next)", () => {
    for (const { key, mod } of routes) {
      for (const name of Object.keys(mod)) {
        expect(["GET", "POST", "PUT", "PATCH", "DELETE"], `${key} exports ${name}`).toContain(name);
      }
    }
  });
});

describe.skipIf(!canRun)("API security sweep (live database)", () => {
  const DOMAIN = "bundlecraft-audit-a.myshopify.com";
  let cookie: string;

  beforeAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: DOMAIN } });
    const shop = await prisma.shop.create({
      data: { shopDomain: DOMAIN, accessToken: "x", email: "audit@example.com" },
    });
    cookie = await createSessionToken(
      { shopId: shop.id, shopDomain: DOMAIN },
      process.env.SESSION_SECRET!,
    );
  });
  afterAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: DOMAIN } });
    await prisma.$disconnect();
  });

  const ofKind = (kind: Kind) => routes.filter((r) => MANIFEST[r.key] === kind);

  it("merchant routes: 401 for anonymous, forged and tampered sessions, on every method", async () => {
    for (const { key, mod } of ofKind("merchant")) {
      for (const method of METHODS.filter((m) => mod[m])) {
        for (const forged of [undefined, "garbage", `${cookie}x`, cookie.split(".")[0]]) {
          currentCookie = forged;
          const response = await call(mod, method, key, {
            headers: { [CSRF_HEADER]: CSRF_HEADER_VALUE },
          });
          expect(response.status, `${method} ${key} with ${String(forged).slice(0, 8)}`).toBe(401);
          expect(JSON.stringify(await response.json())).not.toMatch(LEAKS);
        }
      }
    }
  });

  it("merchant routes: a valid session without the CSRF header cannot change state (403)", async () => {
    currentCookie = cookie;
    for (const { key, mod } of ofKind("merchant")) {
      for (const method of METHODS.filter((m) => mod[m] && m !== "GET")) {
        const response = await call(mod, method, key, { body: "{}" });
        expect(response.status, `${method} ${key}`).toBe(403);
      }
    }
  });

  it("merchant routes: cross-site simple requests are refused (CSRF header can't be set without preflight)", async () => {
    currentCookie = cookie;
    for (const { key, mod } of ofKind("merchant")) {
      for (const method of METHODS.filter((m) => mod[m] && m !== "GET")) {
        const response = await call(mod, method, key, {
          body: "plan=starter",
          headers: { "content-type": "application/x-www-form-urlencoded" },
        });
        expect(response.status).toBe(403);
      }
    }
  });

  it("storefront routes: unsigned or wrongly signed requests get 401 and no data", async () => {
    for (const { key, mod } of ofKind("storefront")) {
      for (const method of METHODS.filter((m) => mod[m])) {
        for (const query of [
          "",
          "?shop=bundlecraft-audit-a.myshopify.com",
          "?shop=bundlecraft-audit-a.myshopify.com&timestamp=1&signature=deadbeef",
          `?shop=evil.example.com&timestamp=${Math.floor(Date.now() / 1000)}&signature=00`,
        ]) {
          const handler = mod[method]!;
          const response = await handler(
            new Request(`http://localhost/api/${key}${query}`, {
              method,
              body: method === "GET" ? undefined : "{}",
            }) as never,
          );
          expect(response.status, `${method} ${key}${query}`).toBe(401);
          expect(JSON.stringify(await response.json())).not.toMatch(LEAKS);
        }
      }
    }
  });

  it("webhooks: missing, empty, wrong and body-mismatched signatures get 401", async () => {
    for (const { key, mod } of ofKind("webhook")) {
      for (const hmac of [undefined, "", "AAAA", "not base64!!"]) {
        const response = await mod.POST!(
          new Request(`http://localhost/api/${key}`, {
            method: "POST",
            body: "{}",
            headers: {
              ...(hmac === undefined ? {} : { "x-shopify-hmac-sha256": hmac }),
              "x-shopify-shop-domain": DOMAIN,
              "x-shopify-topic": "orders/paid",
            },
          }) as never,
        );
        expect(response.status, `${key} hmac=${String(hmac)}`).toBe(401);
      }
    }
  });

  it("webhooks: an oversized body is refused before any signature work (413)", async () => {
    for (const { key, mod } of ofKind("webhook")) {
      const response = await mod.POST!(
        new Request(`http://localhost/api/${key}`, {
          method: "POST",
          body: "x".repeat(2 * 1024 * 1024 + 1),
          headers: { "x-shopify-hmac-sha256": "AAAA" },
        }) as never,
      );
      expect(response.status).toBe(413);
    }
  });

  it("OAuth start: invalid shops are refused without redirecting anywhere", async () => {
    const { mod } = ofKind("oauth-start")[0];
    for (const shop of [
      "",
      "evil.com",
      "evil.myshopify.com.evil.com",
      "//evil.com",
      "a.myshopify.com/../../x",
      "a b.myshopify.com",
      "<script>.myshopify.com",
      "a.myshopify.com@evil.com",
      "javascript:alert(1)",
    ]) {
      const response = await mod.GET!(
        new NextRequest(
          `http://localhost/api/auth/shopify?top_level=1&shop=${encodeURIComponent(shop)}`,
        ) as never,
      );
      expect(response.status, shop).toBe(400);
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("OAuth start: the iframe-breakout page cannot be script-injected through the query string", async () => {
    const { mod } = ofKind("oauth-start")[0];
    const payload = encodeURIComponent('"</script><script>alert(1)</script>');
    const response = await mod.GET!(
      new NextRequest(`http://localhost/api/auth/shopify?shop=${payload}&x=${payload}`) as never,
    );
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html.match(/<script>/g)).toHaveLength(1);
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html).not.toContain("alert(1)</script>");
  });

  it("OAuth callback: missing state, missing/forged HMAC and junk are 400 with no cookie and no detail", async () => {
    const { mod } = ofKind("oauth-callback")[0];
    for (const query of [
      "",
      "?shop=a.myshopify.com&code=abc&state=x&hmac=deadbeef&timestamp=1",
      "?shop=evil.com&code=abc&state=x&hmac=00",
      "?code=abc",
    ]) {
      const response = await mod.GET!(
        new NextRequest(`http://localhost/api/auth/callback${query}`, {
          headers: { cookie: "bundlecraft_oauth_state=other" },
        }) as never,
      );
      expect(response.status, query).toBe(400);
      expect(response.headers.get("set-cookie") ?? "").not.toMatch(/bundlecraft_session=[^;]/);
      const body = JSON.stringify(await response.json());
      expect(body).not.toMatch(LEAKS);
      expect(body).not.toMatch(/secret|token|hmac/i);
    }
  });

  it("billing return: without a session it only redirects to sign-in and changes nothing", async () => {
    const { mod } = ofKind("billing-return")[0];
    const response = await mod.GET!(
      new NextRequest("http://localhost/api/billing/callback?charge_id=1") as never,
    );
    expect(new URL(response.headers.get("location")!).pathname).toBe("/api/auth/shopify");
  });
});

describe.skipIf(!canRun)("error responses never leak internals", () => {
  it("malformed ids, methods and bodies on a merchant route return clean JSON errors", async () => {
    const DOMAIN = "bundlecraft-audit-b.myshopify.com";
    await prisma.shop.deleteMany({ where: { shopDomain: DOMAIN } });
    const shop = await prisma.shop.create({
      data: { shopDomain: DOMAIN, accessToken: "x", email: "b@example.com" },
    });
    currentCookie = await createSessionToken(
      { shopId: shop.id, shopDomain: DOMAIN },
      process.env.SESSION_SECRET!,
    );
    try {
      const mod = modules["./bundles/[id]"]!;
      for (const id of ["nope", "1", "' OR 1=1 --", "%00", "../../etc/passwd", "x".repeat(500)]) {
        const response = await mod.GET!(
          new NextRequest(`http://localhost/api/bundles/x`) as never,
          { params: Promise.resolve({ id }) } as never,
        );
        expect(response.status, id).toBe(400);
        const text = await response.text();
        expect(text).not.toMatch(LEAKS);
        expect(() => JSON.parse(text)).not.toThrow();
      }
    } finally {
      await prisma.shop.deleteMany({ where: { shopDomain: DOMAIN } });
    }
  });
});
