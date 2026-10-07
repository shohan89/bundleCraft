// @vitest-environment node
import "dotenv/config";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionToken } from "@/lib/auth/session";
import {
  badSignatureLimiter,
  cartLimiter,
  eventLimiter,
  oauthStartLimiter,
} from "@/lib/api/limiters";
import { prisma } from "@/lib/prisma";
import { GET as startOAuth } from "./auth/shopify/route";
import { GET as listBundlesRoute } from "./bundles/route";
import { POST as cartRoute } from "./storefront/cart/route";
import { POST as eventsRoute } from "./storefront/events/route";
import { POST as ordersPaid } from "./webhooks/orders-paid/route";

/**
 * Performance and hardening behaviour at the HTTP layer (ACTION-016): pagination and payload
 * size, the storefront shop cache, rate limiting, and that an unexpected failure is logged
 * safely and reported without internals.
 */
let currentCookie: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "bundlecraft_session" && currentCookie ? { name, value: currentCookie } : undefined,
  }),
}));

const canRun =
  Boolean(process.env.DATABASE_URL) &&
  Boolean(process.env.SESSION_SECRET) &&
  Boolean(process.env.SHOPIFY_API_SECRET);
const DOMAIN_A = "bundlecraft-perfapi-a.myshopify.com";
const DOMAIN_B = "bundlecraft-perfapi-b.myshopify.com";
const SECRET = process.env.SHOPIFY_API_SECRET ?? "";

function signed(path: string, shop = DOMAIN_A, extra: Record<string, string> = {}) {
  const pairs: [string, string][] = [
    ["shop", shop],
    ["path_prefix", "/apps/bundlecraft"],
    ["timestamp", String(Math.floor(Date.now() / 1000))],
    ...Object.entries(extra),
  ];
  const message = [...pairs]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("");
  const signature = createHmac("sha256", SECRET).update(message).digest("hex");
  return `http://localhost/api/storefront/${path}?${new URLSearchParams([...pairs, ["signature", signature]])}`;
}

describe.skipIf(!canRun)("performance and hardening (live database)", () => {
  let shopA: string;
  let shopB: string;
  let cookieA: string;
  let bundleA: string;

  beforeAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    shopA = (
      await prisma.shop.create({
        data: { shopDomain: DOMAIN_A, accessToken: "x", email: "a@example.com" },
      })
    ).id;
    shopB = (
      await prisma.shop.create({
        data: { shopDomain: DOMAIN_B, accessToken: "x", email: "b@example.com" },
      })
    ).id;
    cookieA = await createSessionToken(
      { shopId: shopA, shopDomain: DOMAIN_A },
      process.env.SESSION_SECRET!,
    );
    for (let i = 0; i < 7; i++) {
      const bundle = await prisma.bundle.create({
        data: {
          shopId: shopA,
          title: `Paged ${i}`,
          bundleType: "fixed",
          discountType: "percentage",
          discountValue: 10,
          status: "active",
          bundleProducts: {
            create: [{ shopifyProductId: "1", shopifyVariantId: "11", quantity: 1, position: 0 }],
          },
        },
      });
      if (i === 0) bundleA = bundle.id;
    }
  }, 60_000);

  afterAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    await prisma.$disconnect();
  }, 60_000);

  beforeEach(() => {
    currentCookie = cookieA;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    for (const limiter of [eventLimiter, cartLimiter, oauthStartLimiter, badSignatureLimiter]) {
      limiter.reset();
    }
  });

  describe("GET /api/bundles is paginated", () => {
    const get = async (query = "") => {
      const response = await listBundlesRoute(new Request(`http://localhost/api/bundles${query}`));
      const text = await response.text();
      return { response, text, body: JSON.parse(text) };
    };

    it("returns a page with the total, newest first, and pages that never overlap or skip", async () => {
      const seen: string[] = [];
      for (const page of [1, 2, 3]) {
        const { response, body } = await get(`?limit=3&page=${page}`);
        expect(response.status).toBe(200);
        expect(body.data).toMatchObject({ page, limit: 3, total: 7 });
        seen.push(...body.data.bundles.map((b: { id: string }) => b.id));
        expect(body.data.bundles.length).toBe(page === 3 ? 1 : 3);
      }
      expect(new Set(seen).size).toBe(7);
      const all = (await get("?limit=100")).body.data.bundles as {
        id: string;
        createdAt: string;
      }[];
      expect(seen).toEqual(all.map((b) => b.id)); // same order across pages
      const times = all.map((b) => new Date(b.createdAt).getTime());
      expect(times).toEqual([...times].sort((x, y) => y - x));
    });

    it("has a default and a maximum page size", async () => {
      expect((await get()).body.data).toMatchObject({ page: 1, limit: 50 });
      expect((await get("?limit=100")).response.status).toBe(200);
      for (const bad of [
        "?limit=101",
        "?limit=0",
        "?limit=-1",
        "?limit=abc",
        "?page=0",
        "?page=1.5",
      ]) {
        const { response, body } = await get(bad);
        expect(response.status, bad).toBe(400);
        expect(body.error.code).toBe("INVALID_REQUEST");
      }
    });

    it("refuses unknown parameters, including a client-supplied shop id", async () => {
      for (const bad of [`?shopId=${shopB}`, "?status=active", "?limit=5&limit=6&sort=x"]) {
        expect((await get(bad)).response.status, bad).toBe(400);
      }
    });

    it("the response size follows the page size, not the number of bundles", async () => {
      const small = await get("?limit=1");
      const large = await get("?limit=7");
      expect(small.text.length).toBeLessThan(large.text.length / 3);
      expect(small.body.data.bundles).toHaveLength(1);
      expect(small.body.data.total).toBe(7);
    });

    it("an empty page past the end is a normal empty list", async () => {
      const { response, body } = await get("?limit=5&page=99");
      expect(response.status).toBe(200);
      expect(body.data.bundles).toEqual([]);
      expect(body.data.total).toBe(7);
    });
  });

  describe("storefront shop cache", () => {
    async function freshAuth() {
      vi.stubEnv("STOREFRONT_SHOP_CACHE_MS", "30000");
      vi.resetModules();
      const storefront = await import("@/lib/api/storefront");
      const { prisma: fresh } = await import("@/lib/prisma");
      return { ...storefront, fresh, lookups: vi.spyOn(fresh.shop, "findUnique") };
    }
    const request = (shop = DOMAIN_A) => new Request(signed("bundles", shop));

    it("looks the shop up once for many verified requests", async () => {
      const { authenticateStorefrontRequest, lookups, fresh } = await freshAuth();
      try {
        for (let i = 0; i < 5; i++) {
          const shop = await authenticateStorefrontRequest(request());
          expect(shop).toEqual({ id: shopA, shopDomain: DOMAIN_A });
        }
        expect(lookups).toHaveBeenCalledTimes(1);
      } finally {
        await fresh.$disconnect();
      }
    });

    it("is tenant isolated: each signed domain resolves to its own shop", async () => {
      const { authenticateStorefrontRequest, lookups, fresh } = await freshAuth();
      try {
        const a1 = await authenticateStorefrontRequest(request(DOMAIN_A));
        const b1 = await authenticateStorefrontRequest(request(DOMAIN_B));
        const a2 = await authenticateStorefrontRequest(request(DOMAIN_A));
        expect([a1.id, b1.id, a2.id]).toEqual([shopA, shopB, shopA]);
        expect(lookups).toHaveBeenCalledTimes(2);
      } finally {
        await fresh.$disconnect();
      }
    });

    it("never serves an unverified request from the cache", async () => {
      const { authenticateStorefrontRequest, lookups, fresh } = await freshAuth();
      try {
        await authenticateStorefrontRequest(request());
        const before = lookups.mock.calls.length;
        for (const url of [
          `http://localhost/api/storefront/bundles?shop=${DOMAIN_A}`, // unsigned
          signed("bundles").replace(/signature=[0-9a-f]+/, "signature=deadbeef"), // tampered
          signed("bundles", DOMAIN_A).replace(DOMAIN_A, DOMAIN_B), // shop swapped after signing
        ]) {
          await expect(authenticateStorefrontRequest(new Request(url))).rejects.toMatchObject({
            status: 401,
          });
        }
        expect(lookups.mock.calls.length).toBe(before);
      } finally {
        await fresh.$disconnect();
      }
    });

    it("forgets a shop when it is invalidated (the uninstall path) and does not cache inactive shops", async () => {
      const { authenticateStorefrontRequest, invalidateStorefrontShop, lookups, fresh } =
        await freshAuth();
      try {
        await authenticateStorefrontRequest(request());
        await prisma.shop.update({ where: { id: shopB }, data: { status: "inactive" } });
        await expect(authenticateStorefrontRequest(request(DOMAIN_B))).rejects.toMatchObject({
          status: 404,
        });
        await expect(authenticateStorefrontRequest(request(DOMAIN_B))).rejects.toMatchObject({
          status: 404,
        });
        const inactiveLookups = lookups.mock.calls.length;
        expect(inactiveLookups).toBe(3); // A once, B twice: a refusal is never cached

        await prisma.shop.update({ where: { id: shopA }, data: { status: "inactive" } });
        await authenticateStorefrontRequest(request()); // still cached: within the TTL
        invalidateStorefrontShop(DOMAIN_A);
        await expect(authenticateStorefrontRequest(request())).rejects.toMatchObject({
          status: 404,
        });
      } finally {
        await prisma.shop.updateMany({
          where: { id: { in: [shopA, shopB] } },
          data: { status: "active" },
        });
        await fresh.$disconnect();
      }
    });

    it("is off in the test setup, so database changes are seen at once", async () => {
      const { authenticateStorefrontRequest } = await import("@/lib/api/storefront");
      vi.unstubAllEnvs();
      expect(process.env.STOREFRONT_SHOP_CACHE_MS).toBe("0");
      await prisma.shop.update({ where: { id: shopB }, data: { status: "inactive" } });
      try {
        await expect(
          authenticateStorefrontRequest(new Request(signed("bundles", DOMAIN_B))),
        ).rejects.toMatchObject({ status: 404 });
      } finally {
        await prisma.shop.update({ where: { id: shopB }, data: { status: "active" } });
      }
    });
  });

  describe("template catalog cache", () => {
    async function freshTemplates() {
      vi.stubEnv("TEMPLATE_CACHE_MS", "60000");
      vi.resetModules();
      const service = await import("@/services/templates/templates");
      const { prisma: fresh } = await import("@/lib/prisma");
      return { ...service, fresh, reads: vi.spyOn(fresh.template, "findMany") };
    }

    it("reads the catalog once, then serves it from memory, per category", async () => {
      const { listTemplates, fresh, reads } = await freshTemplates();
      try {
        const first = await listTemplates();
        await listTemplates();
        await listTemplates();
        expect(reads).toHaveBeenCalledTimes(1);
        expect(first.length).toBeGreaterThanOrEqual(5);
        await listTemplates({ category: "fashion" });
        await listTemplates({ category: "fashion" });
        expect(reads).toHaveBeenCalledTimes(2); // one more for the new key, then cached
      } finally {
        await fresh.$disconnect();
      }
    });

    it("hands out copies: a caller changing its result cannot alter what others receive", async () => {
      const { listTemplates, fresh } = await freshTemplates();
      try {
        const first = await listTemplates();
        first[0].name = "Tampered";
        first[0].defaults.customization.colors.primary = "#000000";
        first.pop();
        const second = await listTemplates();
        expect(second[0].name).not.toBe("Tampered");
        expect(second[0].defaults.customization.colors.primary).not.toBe("#000000");
        expect(second.length).toBeGreaterThanOrEqual(5);
      } finally {
        await fresh.$disconnect();
      }
    });

    it("holds only global template data (no shop or merchant information)", async () => {
      const { listTemplates, fresh } = await freshTemplates();
      try {
        const text = JSON.stringify(await listTemplates());
        expect(text).not.toMatch(/shopId|shop_id|accessToken|myshopify|email/i);
      } finally {
        await fresh.$disconnect();
      }
    });

    it("can be cleared after the catalog changes in the same process", async () => {
      const { listTemplates, clearTemplateCache, fresh, reads } = await freshTemplates();
      try {
        await listTemplates();
        clearTemplateCache();
        await listTemplates();
        expect(reads).toHaveBeenCalledTimes(2);
      } finally {
        await fresh.$disconnect();
      }
    });
  });

  describe("rate limiting", () => {
    const post = (
      route: (r: Request) => Promise<Response>,
      path: string,
      body: unknown,
      shop = DOMAIN_A,
    ) => route(new Request(signed(path, shop), { method: "POST", body: JSON.stringify(body) }));
    const event = (id: string) => ({ bundleId: bundleA, event: "bundle_view", eventId: id });

    it("storefront events: a client over its limit gets 429 with Retry-After and nothing is recorded", async () => {
      vi.stubEnv("RATE_LIMIT", "on");
      for (let i = 0; i < 120; i++) eventLimiter.hit(`${shopA}:unknown`);
      const before = await prisma.analyticsEvent.count({ where: { shopId: shopA } });
      const response = await post(eventsRoute, "events", event(crypto.randomUUID()));
      expect(response.status).toBe(429);
      expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
      expect((await response.json()).error).toMatchObject({ code: "RATE_LIMITED" });
      expect(await prisma.analyticsEvent.count({ where: { shopId: shopA } })).toBe(before);
    });

    it("is per shop: another shop's events are unaffected", async () => {
      vi.stubEnv("RATE_LIMIT", "on");
      for (let i = 0; i < 120; i++) eventLimiter.hit(`${shopA}:unknown`);
      const other = await post(eventsRoute, "events", event(crypto.randomUUID()), DOMAIN_B);
      // Shop B has no such bundle (404), which proves the request got past the limiter.
      expect(other.status).toBe(404);
    });

    it("storefront cart: 429 over the limit", async () => {
      vi.stubEnv("RATE_LIMIT", "on");
      for (let i = 0; i < 60; i++) cartLimiter.hit(`${shopA}:unknown`);
      const response = await post(cartRoute, "cart", { bundleId: bundleA, selection: [] });
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBeTruthy();
    });

    it("normal use is never limited (a page of widgets sends a handful of events)", async () => {
      vi.stubEnv("RATE_LIMIT", "on");
      for (let i = 0; i < 15; i++) {
        const response = await post(eventsRoute, "events", event(crypto.randomUUID()));
        expect(response.status).toBe(202);
      }
    });

    it("can be switched off", async () => {
      vi.stubEnv("RATE_LIMIT", "off");
      for (let i = 0; i < 200; i++) eventLimiter.hit(`${shopA}:unknown`);
      const response = await post(eventsRoute, "events", event(crypto.randomUUID()));
      expect(response.status).toBe(202);
    });

    it("OAuth start: 429 over the limit, before anything else happens", async () => {
      vi.stubEnv("RATE_LIMIT", "on");
      for (let i = 0; i < 30; i++) oauthStartLimiter.hit("unknown");
      const response = await startOAuth(
        new NextRequest(`http://localhost/api/auth/shopify?shop=${DOMAIN_A}`),
      );
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBeTruthy();
      expect(await response.json()).toEqual({ error: "Too many requests" });
    });

    it("webhooks: repeated BAD signatures are turned away, valid Shopify traffic is never counted", async () => {
      vi.stubEnv("RATE_LIMIT", "on");
      const hit = vi.spyOn(badSignatureLimiter, "hit");
      const send = (hmac: string, body = "{}") =>
        ordersPaid(
          new Request("http://localhost/api/webhooks/orders-paid", {
            method: "POST",
            body,
            headers: {
              "x-shopify-hmac-sha256": hmac,
              "x-shopify-shop-domain": DOMAIN_A,
              "x-shopify-topic": "orders/paid",
              "x-shopify-webhook-id": crypto.randomUUID(),
            },
          }),
        );
      const validHmac = (body: string) =>
        createHmac("sha256", SECRET).update(body).digest("base64");

      for (let i = 0; i < 25; i++) {
        const body = JSON.stringify({ id: i, note: "valid signature, unknown order" });
        expect((await send(validHmac(body), body)).status).not.toBe(429);
      }
      expect(hit).not.toHaveBeenCalled(); // genuine traffic is not counted at all

      const statuses: number[] = [];
      for (let i = 0; i < 25; i++) statuses.push((await send("AAAA")).status);
      expect(statuses.slice(0, 20).every((s) => s === 401)).toBe(true);
      expect(statuses.slice(20).every((s) => s === 429)).toBe(true);
    });
  });

  describe("unexpected failures", () => {
    it("are logged as one scrubbed line and reported with a request id and no internals", async () => {
      const boom = Object.assign(
        new Error("connect failed: postgresql://user:pw123@db.internal/app shpat_0123456789abcdef"),
        {
          code: "P1001",
        },
      );
      vi.spyOn(prisma.bundle, "findMany").mockRejectedValue(boom);
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});

      const response = await listBundlesRoute(
        new Request("http://localhost/api/bundles?limit=5", {
          headers: { "x-request-id": "req-abcdef123456" },
        }),
      );
      const text = await response.text();
      const body = JSON.parse(text);

      expect(response.status).toBe(500);
      expect(body.error).toEqual({
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again.",
        requestId: "req-abcdef123456",
      });
      expect(response.headers.get("x-request-id")).toBe("req-abcdef123456");
      for (const leak of ["postgresql", "pw123", "shpat_", "db.internal", "P1001", "stack"]) {
        expect(text, leak).not.toContain(leak);
      }

      const lines = logged.mock.calls.map((call) => String(call[0]));
      expect(lines).toHaveLength(1);
      const line = JSON.parse(lines[0]);
      expect(line).toMatchObject({
        event: "api_unexpected_error",
        requestId: "req-abcdef123456",
        route: "/api/bundles",
        method: "GET",
        errorCode: "P1001",
      });
      for (const secret of ["pw123", "shpat_0123", "limit=5", "user:pw"]) {
        expect(lines[0], secret).not.toContain(secret);
      }
    });

    it("expected errors (validation, not found, unauthorized) are not logged as failures", async () => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      await listBundlesRoute(new Request("http://localhost/api/bundles?limit=999")); // 400
      currentCookie = undefined;
      await listBundlesRoute(new Request("http://localhost/api/bundles")); // 401
      expect(logged).not.toHaveBeenCalled();
    });
  });
});
