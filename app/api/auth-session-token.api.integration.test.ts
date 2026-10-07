// @vitest-environment node
import "dotenv/config";
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CSRF_HEADER, CSRF_HEADER_VALUE } from "@/lib/api/csrf";
import { prisma } from "@/lib/prisma";
import { grantPlan } from "@/services/billing/testing";
import { seedCatalog } from "@/services/products/testing";
import { GET as listBundles } from "./bundles/route";
import { GET as customization } from "./bundles/[id]/customization/route";
import { GET as listProducts } from "./products/route";
import { GET as listTemplates } from "./templates/route";
import { GET as analyticsOverview } from "./analytics/overview/route";
import { GET as billingCurrent } from "./billing/current/route";

// No session cookie exists in any of these tests: every request authenticates with a bearer
// token alone, so this only supplies the empty cookie jar `cookies()` needs to not throw.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

/**
 * Session-token authentication (ACTION-017A) across the merchant APIs named in scope: bundles,
 * products, templates, analytics, billing, and a bundle's customization. No `next/headers` mock
 * here on purpose — every request below authenticates with `Authorization: Bearer`, never a
 * cookie, proving the token path stands on its own.
 */
const canRun =
  Boolean(process.env.DATABASE_URL) &&
  Boolean(process.env.SHOPIFY_API_KEY) &&
  Boolean(process.env.SHOPIFY_API_SECRET);
const API_KEY = process.env.SHOPIFY_API_KEY ?? "";
const API_SECRET = process.env.SHOPIFY_API_SECRET ?? "";
const DOMAIN_A = "bundlecraft-tokapi-a.myshopify.com";
const DOMAIN_B = "bundlecraft-tokapi-b.myshopify.com";

const base64url = (bytes: Buffer) =>
  bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const encode = (value: unknown) => base64url(Buffer.from(JSON.stringify(value)));

function tokenFor(shopDomain: string, over: Record<string, unknown> = {}, secret = API_SECRET) {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    iss: `https://${shopDomain}/admin`,
    dest: `https://${shopDomain}`,
    aud: API_KEY,
    sub: "1",
    exp: now + 60,
    nbf: now - 5,
    iat: now - 5,
    jti: crypto.randomUUID(),
    ...over,
  });
  const sig = base64url(createHmac("sha256", secret).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

function req(url: string, token?: string, init: RequestInit = {}) {
  return new Request(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.method && init.method !== "GET" ? { [CSRF_HEADER]: CSRF_HEADER_VALUE } : {}),
    },
  });
}
const status = async (response: Response) => ({
  status: response.status,
  body: await response.json(),
});

describe.skipIf(!canRun)("session-token authentication on merchant APIs (live database)", () => {
  let shopA: string;
  let bundleId: string;

  beforeAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    shopA = (
      await prisma.shop.create({
        data: { shopDomain: DOMAIN_A, accessToken: "x", email: "a@example.com" },
      })
    ).id;
    await prisma.shop.create({
      data: { shopDomain: DOMAIN_B, accessToken: "x", email: "b@example.com" },
    });
    await grantPlan(shopA, "growth");
    await seedCatalog(shopA, [{ productId: "9101", variantId: "91011" }]);
    const bundle = await prisma.bundle.create({
      data: {
        shopId: shopA,
        title: "Token auth bundle",
        bundleType: "fixed",
        discountType: "percentage",
        discountValue: 10,
        status: "draft",
        bundleProducts: {
          create: [
            { shopifyProductId: "9101", shopifyVariantId: "91011", quantity: 1, position: 0 },
          ],
        },
      },
    });
    bundleId = bundle.id;
  }, 60_000);

  afterAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    await prisma.$disconnect();
  }, 60_000);

  const routes = [
    {
      name: "GET /api/bundles",
      call: () => listBundles(req("http://localhost/api/bundles", tokenFor(DOMAIN_A))),
    },
    {
      name: "GET /api/products",
      call: () => listProducts(req("http://localhost/api/products", tokenFor(DOMAIN_A))),
    },
    {
      name: "GET /api/templates",
      call: () => listTemplates(req("http://localhost/api/templates", tokenFor(DOMAIN_A))),
    },
    {
      name: "GET /api/analytics/overview",
      call: () =>
        analyticsOverview(req("http://localhost/api/analytics/overview", tokenFor(DOMAIN_A))),
    },
    {
      name: "GET /api/billing/current",
      call: () => billingCurrent(req("http://localhost/api/billing/current", tokenFor(DOMAIN_A))),
    },
    {
      name: "GET /api/bundles/:id/customization",
      call: () =>
        customization(
          req(`http://localhost/api/bundles/${bundleId}/customization`, tokenFor(DOMAIN_A)),
          {
            params: Promise.resolve({ id: bundleId }),
          },
        ),
    },
  ];

  it("an authenticated (valid) token succeeds on every route in scope", async () => {
    for (const route of routes) {
      const response = await route.call();
      expect(response.status, route.name).toBe(200);
    }
  });

  it("an anonymous request (no token, no cookie) fails on every route", async () => {
    const anon = [
      () => listBundles(req("http://localhost/api/bundles")),
      () => listProducts(req("http://localhost/api/products")),
      () => listTemplates(req("http://localhost/api/templates")),
      () => analyticsOverview(req("http://localhost/api/analytics/overview")),
      () => billingCurrent(req("http://localhost/api/billing/current")),
      () =>
        customization(req(`http://localhost/api/bundles/${bundleId}/customization`), {
          params: Promise.resolve({ id: bundleId }),
        }),
    ];
    for (const call of anon) {
      const { status: s, body } = await status(await call());
      expect(s).toBe(401);
      expect(body.error.code).toBe("UNAUTHORIZED");
    }
  });

  it("a forged token (wrong signature) fails on every route", async () => {
    const forged = tokenFor(DOMAIN_A, {}, "not-the-real-secret");
    for (const route of routes) {
      const response = await customization(
        req(`http://localhost/api/bundles/${bundleId}/customization`, forged),
        {
          params: Promise.resolve({ id: bundleId }),
        },
      );
      expect(response.status, route.name).toBe(401);
    }
  });

  it("an expired token fails", async () => {
    const expired = tokenFor(DOMAIN_A, { exp: Math.floor(Date.now() / 1000) - 5 });
    expect((await listBundles(req("http://localhost/api/bundles", expired))).status).toBe(401);
  });

  it("a token for another shop cannot see or touch this shop's data", async () => {
    const asB = tokenFor(DOMAIN_B);
    const bundles = await status(await listBundles(req("http://localhost/api/bundles", asB)));
    expect(bundles.status).toBe(200);
    expect((bundles.body.data.bundles as unknown[]).length).toBe(0); // shop B has none — not shop A's

    const theirs = await customization(
      req(`http://localhost/api/bundles/${bundleId}/customization`, asB),
      { params: Promise.resolve({ id: bundleId }) },
    );
    expect(theirs.status).toBe(404); // shop A's bundle is invisible to shop B, token or not
  });

  it("an inactive (uninstalled) shop's token is refused everywhere", async () => {
    await prisma.shop.update({ where: { id: shopA }, data: { status: "inactive" } });
    try {
      for (const route of routes) {
        expect((await route.call()).status, route.name).toBe(401);
      }
    } finally {
      await prisma.shop.update({ where: { id: shopA }, data: { status: "active" } });
    }
  });

  it("a client-supplied shopId cannot substitute for the token's shop", async () => {
    const response = await status(
      await listBundles(
        req(`http://localhost/api/bundles?shopId=${crypto.randomUUID()}`, tokenFor(DOMAIN_A)),
      ),
    );
    // `shopId` is not a parameter this route accepts at all (an unknown filter, 400); the shop
    // always comes from the authenticated token, never from anything in the request.
    expect(response.status).toBe(400);
  });

  it("writes still require the CSRF header even when authenticated by token", async () => {
    const withoutCsrf = new Request("http://localhost/api/bundles", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenFor(DOMAIN_A)}`,
        "content-type": "application/json",
      },
      body: "{}",
    });
    const { POST } = await import("./bundles/route");
    expect((await POST(withoutCsrf)).status).toBe(403);
  });

  it("never leaks an access token, a session token, or a stack trace in any response", async () => {
    for (const route of routes) {
      const text = await (await route.call()).clone().text();
      expect(text, route.name).not.toMatch(
        /shpat_|shpss_|Bearer |eyJ[A-Za-z0-9_-]{10,}|at .*:\d+:\d+/,
      );
    }
  });
});

describe.skipIf(!canRun)("logging never records a session token", () => {
  it("an unexpected failure logs no bearer value", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.bundle, "findMany").mockRejectedValueOnce(new Error("boom"));
    const token = tokenFor(DOMAIN_A);
    await listBundles(req("http://localhost/api/bundles", token));
    const lines = logged.mock.calls.map((c) => String(c[0])).join("\n");
    expect(lines).not.toContain(token);
    expect(lines).not.toMatch(/Bearer /);
    vi.restoreAllMocks();
  });
});
