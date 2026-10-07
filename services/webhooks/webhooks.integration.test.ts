// @vitest-environment node
import "dotenv/config";
import { createHmac, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { WEBHOOK_ENDPOINTS } from "@/lib/webhooks/registry";
import { createSessionToken } from "@/lib/auth/session";
import { getAuthenticatedShop } from "@/lib/auth/shopify-auth";
import { prisma } from "@/lib/prisma";
import { fakeBilling } from "@/services/billing/test-instance";
import { fakeCatalog } from "@/services/products/test-instance";
import { grantPlan } from "@/services/billing/testing";
import { POST as appUninstalled } from "@/app/api/webhooks/app-uninstalled/route";
import { POST as ordersPaid } from "@/app/api/webhooks/orders-paid/route";
import { POST as products } from "@/app/api/webhooks/products/route";
import { POST as compliance } from "@/app/api/webhooks/compliance/route";
import { POST as subscriptionsUpdate } from "@/app/api/webhooks/app-subscriptions-update/route";
import { GET as storefrontBundles } from "@/app/api/storefront/bundles/route";
import { GET as analyticsOverview } from "@/app/api/analytics/overview/route";
import { STALE_AFTER_MS } from "./idempotency";

/**
 * Webhook pipeline tests: real database, real route handlers, requests signed exactly as
 * Shopify signs them. Shopify itself is never contacted (billing reads use an in-memory
 * fake), so this proves our behaviour, NOT live delivery from Shopify.
 */
vi.mock("@/services/products/gateway", async () => {
  const { fakeCatalog } = await import("@/services/products/test-instance");
  return { openCatalogGateway: async () => fakeCatalog };
});
vi.mock("@/services/billing/gateway", async () => {
  const { fakeBilling } = await import("@/services/billing/test-instance");
  return { openBillingGateway: async () => fakeBilling };
});
let currentCookie: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "bundlecraft_session" && currentCookie ? { name, value: currentCookie } : undefined,
  }),
}));

const SECRET = process.env.SHOPIFY_API_SECRET ?? "";
const canRun =
  Boolean(process.env.DATABASE_URL) && Boolean(process.env.SESSION_SECRET) && Boolean(SECRET);
const DOMAIN_A = "bundlecraft-hook-a.myshopify.com";
const DOMAIN_B = "bundlecraft-hook-b.myshopify.com";
const DOMAIN_C = "bundlecraft-hook-c.myshopify.com";
const B1 = "5f0c6a6e-8f0e-4c53-9b64-6f7f3f2b9a11";

type Route = (request: Request) => Promise<Response>;
interface Send {
  route?: Route;
  topic: string;
  body: unknown;
  shop?: string;
  eventId?: string | null;
  secret?: string;
  hmac?: string;
  triggeredAt?: string;
  omit?: string[];
  rawBody?: string;
}

const routeFor = (topic: string): Route =>
  topic === "customers/data_request" || topic === "customers/redact" || topic === "shop/redact"
    ? compliance
    : topic === "app/uninstalled"
      ? appUninstalled
      : topic === "orders/paid"
        ? ordersPaid
        : topic === "app_subscriptions/update"
          ? subscriptionsUpdate
          : products;

function send(o: Send) {
  const raw = o.rawBody ?? JSON.stringify(o.body);
  const headers: Record<string, string> = {
    "x-shopify-hmac-sha256":
      o.hmac ??
      createHmac("sha256", o.secret ?? SECRET)
        .update(raw)
        .digest("base64"),
    "x-shopify-topic": o.topic,
    "x-shopify-shop-domain": o.shop ?? DOMAIN_A,
  };
  if (o.eventId !== null) headers["x-shopify-event-id"] = o.eventId ?? randomUUID();
  if (o.triggeredAt) headers["x-shopify-triggered-at"] = o.triggeredAt;
  for (const name of o.omit ?? []) delete headers[name];
  return (o.route ?? routeFor(o.topic))(
    new Request("http://localhost/api/webhooks/x", { method: "POST", body: raw, headers }),
  );
}
const json = async (r: Response) => (await r.json()) as Record<string, unknown>;

const orderFor = (bundleId: string, id: number, instances: string[] = [randomUUID()]) => ({
  id,
  email: "customer@example.com",
  line_items: instances.map((instanceId) => ({
    quantity: 1,
    price_set: { shop_money: { amount: "30.00", currency_code: "USD" } },
    discount_allocations: [],
    properties: [
      { name: "_bundle_id", value: bundleId },
      { name: "_bundle_instance_id", value: instanceId },
    ],
  })),
});

describe.skipIf(!canRun)("webhook pipeline (live database, signed local requests)", () => {
  let shopA: string;
  let shopB: string;
  let shopC: string;
  let bundleA: string;
  let bundleB: string;

  const events = (shopId: string) =>
    prisma.webhookEvent.findMany({ where: { shopId }, orderBy: { createdAt: "asc" } });
  const purchases = (bundleId: string) =>
    prisma.analyticsEvent.count({ where: { bundleId, eventType: "bundle_purchase" } });

  beforeAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B, DOMAIN_C] } } });
    const make = async (shopDomain: string) =>
      (
        await prisma.shop.create({
          data: { shopDomain, accessToken: "enc-token", email: "w@example.com" },
        })
      ).id;
    shopA = await make(DOMAIN_A);
    shopB = await make(DOMAIN_B);
    shopC = await make(DOMAIN_C);
    await prisma.shop.update({ where: { id: shopC }, data: { status: "inactive" } });
    const bundle = (shopId: string, title: string) =>
      prisma.bundle.create({
        data: {
          shopId,
          title,
          bundleType: "fixed",
          discountType: "percentage",
          discountValue: 10,
          status: "active",
          shopifyDiscountId: `gid://shopify/DiscountAutomaticNode/${Math.floor(Math.random() * 1e12)}`,
        },
      });
    bundleA = (await bundle(shopA, "A")).id;
    bundleB = (await bundle(shopB, "B")).id;
  });
  afterAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B, DOMAIN_C] } } });
    await prisma.$disconnect();
  });
  beforeEach(() => {
    vi.restoreAllMocks();
    fakeBilling.reset();
    fakeCatalog.reset();
    fakeCatalog.autoCreate = true; // any product id exists in the fake Shopify unless a test says otherwise
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("HMAC and request hygiene (every endpoint)", () => {
    const samples = [
      { topic: "app/uninstalled", body: { id: 1 } },
      { topic: "orders/paid", body: orderFor(B1, 1) },
      {
        topic: "app_subscriptions/update",
        body: { app_subscription: { admin_graphql_api_id: "gid://shopify/AppSubscription/1" } },
      },
      { topic: "products/update", body: { id: 1 } },
      { topic: "customers/redact", body: { customer: { id: 1 } } },
    ];

    it("rejects missing, empty, malformed, wrong-secret and tampered signatures (401) before doing anything", async () => {
      const before = await prisma.webhookEvent.count();
      for (const sample of samples) {
        for (const variant of [
          { omit: ["x-shopify-hmac-sha256"] },
          { hmac: "" },
          { hmac: "not base64 !!" },
          { hmac: "AAAA" },
          { secret: "wrong-secret" },
        ]) {
          const response = await send({ ...sample, ...variant });
          expect(response.status, `${sample.topic} ${JSON.stringify(variant)}`).toBe(401);
          expect(await json(response)).toEqual({});
        }
        // Signed for one body, delivered with another.
        const tampered = await send({
          ...sample,
          hmac: createHmac("sha256", SECRET)
            .update(JSON.stringify({ other: true }))
            .digest("base64"),
        });
        expect(tampered.status).toBe(401);
      }
      expect(await prisma.webhookEvent.count()).toBe(before);
    });

    it("verifies against the raw bytes: reformatted JSON with the original signature fails", async () => {
      const raw = JSON.stringify({ id: 5 });
      const hmac = createHmac("sha256", SECRET).update(raw).digest("base64");
      expect(
        (await send({ topic: "products/update", body: null, rawBody: raw, hmac })).status,
      ).toBe(200);
      expect(
        (await send({ topic: "products/update", body: null, rawBody: `${raw} `, hmac })).status,
      ).toBe(401);
    });

    it("refuses oversized bodies with 413 on every endpoint, before parsing or signature work", async () => {
      for (const { uri } of WEBHOOK_ENDPOINTS) {
        const route = {
          "/api/webhooks/app-uninstalled": appUninstalled,
          "/api/webhooks/orders-paid": ordersPaid,
          "/api/webhooks/app-subscriptions-update": subscriptionsUpdate,
          "/api/webhooks/products": products,
          "/api/webhooks/compliance": compliance,
        }[uri]!;
        const response = await route(
          new Request(`http://localhost${uri}`, {
            method: "POST",
            body: "x".repeat(2 * 1024 * 1024 + 1),
            headers: { "x-shopify-hmac-sha256": "AAAA" },
          }),
        );
        expect(response.status, uri).toBe(413);
      }
    });

    it("acknowledges (200, ignored) a signed event for another topic, a bad shop domain, or a payload it cannot use", async () => {
      const cases = [
        { topic: "orders/create", body: { id: 1 } },
        { topic: "products/update", body: { id: 1 }, shop: "evil.example.com" },
        { topic: "products/update", body: { id: 1 }, shop: "a.myshopify.com.evil.com" },
        { topic: "products/update", body: { id: 1 }, omit: ["x-shopify-shop-domain"] },
        { topic: "products/update", body: { nothing: true } },
        { topic: "orders/paid", body: { line_items: [] } },
        { topic: "app_subscriptions/update", body: { app_subscription: {} } },
      ];
      for (const c of cases) {
        const response = await send(c);
        expect(response.status, JSON.stringify(c)).toBe(200);
        expect(await json(response)).toEqual({ ignored: true });
      }
    });

    it("returns 400 for a validly signed body that is not JSON, without recording anything", async () => {
      const before = await prisma.webhookEvent.count({ where: { shopId: shopA } });
      const response = await send({ topic: "products/update", body: null, rawBody: "{not json" });
      expect(response.status).toBe(400);
      expect(await prisma.webhookEvent.count({ where: { shopId: shopA } })).toBe(before);
    });
  });

  describe("shop identification and tenant isolation", () => {
    it("acknowledges an unknown shop and records nothing", async () => {
      const forUnknown = () =>
        prisma.webhookEvent.count({ where: { shop: { shopDomain: "nobody-here.myshopify.com" } } });
      const response = await send({
        topic: "products/update",
        body: { id: 1 },
        shop: "nobody-here.myshopify.com",
      });
      expect(await json(response)).toEqual({ ignored: true });
      expect(await forUnknown()).toBe(0);
    });

    it("acknowledges and ignores every topic except uninstall for an inactive shop", async () => {
      for (const sample of [
        { topic: "products/update", body: { id: 1 } },
        { topic: "orders/paid", body: orderFor(B1, 1) },
        {
          topic: "app_subscriptions/update",
          body: { app_subscription: { admin_graphql_api_id: "gid://shopify/AppSubscription/1" } },
        },
      ]) {
        const response = await send({ ...sample, shop: DOMAIN_C });
        expect(await json(response)).toEqual({ ignored: true });
      }
      expect(await events(shopC)).toHaveLength(0);
    });

    it("takes the shop from the verified header, never from the payload", async () => {
      // The body names shop B; the verified header says shop A.
      const response = await send({
        topic: "app/uninstalled",
        body: { id: 1, domain: DOMAIN_B, myshopify_domain: DOMAIN_B, shop_id: shopB },
        shop: DOMAIN_C,
      });
      expect(response.status).toBe(200);
      expect((await prisma.shop.findUniqueOrThrow({ where: { id: shopB } })).status).toBe("active");
      expect((await prisma.bundle.findUniqueOrThrow({ where: { id: bundleB } })).status).toBe(
        "active",
      );
    });

    it("an order webhook for shop A cannot attribute revenue to shop B's bundle", async () => {
      const before = await purchases(bundleB);
      const response = await send({
        topic: "orders/paid",
        body: orderFor(bundleB, 4001),
        shop: DOMAIN_A,
      });
      expect(await json(response)).toEqual({ recorded: 0, skipped: 1 });
      expect(await purchases(bundleB)).toBe(before);
    });
  });

  describe("idempotency", () => {
    it("processes the first delivery and answers a redelivery with a no-op duplicate", async () => {
      const eventId = randomUUID();
      const body = { id: 71 };
      const first = await send({ topic: "products/update", body, eventId });
      const second = await send({ topic: "products/update", body, eventId });
      expect(await json(first)).toMatchObject({ result: "synced" });
      expect(await json(second)).toEqual({ duplicate: true });

      const rows = (await events(shopA)).filter((e) => e.eventId === eventId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        status: "processed",
        attempts: 1,
        lastError: null,
        topic: "products/update",
      });
      expect(rows[0].processedAt).not.toBeNull();
    });

    it("without an event id header, an identical body is recognised by its hash", async () => {
      const body = { id: 72, title: "same" };
      const first = await send({ topic: "products/update", body, eventId: null });
      const second = await send({ topic: "products/update", body, eventId: null });
      const third = await send({
        topic: "products/update",
        body: { id: 72, title: "different" },
        eventId: null,
      });
      expect(await json(first)).toMatchObject({ result: "synced" });
      expect(await json(second)).toEqual({ duplicate: true });
      expect(await json(third)).toMatchObject({ result: "synced" });
    });

    it("the same event id on different topics or different shops is a different event", async () => {
      const eventId = randomUUID();
      const a = await send({ topic: "products/create", body: { id: 73 }, eventId });
      const b = await send({ topic: "products/update", body: { id: 73 }, eventId });
      const c = await send({ topic: "products/create", body: { id: 73 }, eventId, shop: DOMAIN_B });
      for (const r of [a, b, c]) expect(await json(r)).toMatchObject({ result: "synced" });
    });

    it("concurrent deliveries of one event produce exactly one processing and one business effect", async () => {
      const eventId = randomUUID();
      const order = orderFor(bundleA, 5001);
      const before = await purchases(bundleA);
      const responses = await Promise.all(
        Array.from({ length: 6 }, () => send({ topic: "orders/paid", body: order, eventId })),
      );
      const bodies = await Promise.all(responses.map(json));
      const processed = bodies.filter((b) => b.recorded === 1);
      expect(processed).toHaveLength(1);
      for (const [i, response] of responses.entries()) {
        // Every other delivery is either a finished-duplicate (200) or told to retry (409).
        if (bodies[i].recorded !== 1) expect([200, 409]).toContain(response.status);
      }
      expect(await purchases(bundleA)).toBe(before + 1);
      expect((await events(shopA)).filter((e) => e.eventId === eventId)).toHaveLength(1);
    });

    it("a failed attempt is not marked processed and the retry succeeds without duplicating anything", async () => {
      const shop = shopA;
      await prisma.subscription.deleteMany({ where: { shopId: shop } });
      await prisma.subscription.create({
        data: {
          shopId: shop,
          plan: "starter",
          status: "pending",
          shopifyChargeId: "gid://shopify/AppSubscription/60001",
        },
      });
      fakeBilling.subscriptions.set("gid://shopify/AppSubscription/60001", {
        id: "gid://shopify/AppSubscription/60001",
        name: "BundleCraft Starter",
        status: "ACTIVE",
        test: true,
        currentPeriodEnd: null,
        price: { amount: 19, currencyCode: "USD", interval: "EVERY_30_DAYS" },
      });
      const eventId = randomUUID();
      const body = {
        app_subscription: { admin_graphql_api_id: "gid://shopify/AppSubscription/60001" },
      };

      fakeBilling.failNext("getSubscription");
      const failed = await send({ topic: "app_subscriptions/update", body, eventId });
      expect(failed.status).toBe(500);
      expect(await json(failed)).toEqual({});
      let [row] = (await events(shop)).filter((e) => e.eventId === eventId);
      expect(row).toMatchObject({ status: "failed", attempts: 1 });
      expect(row.processedAt).toBeNull();
      expect(row.lastError).toBeTruthy();
      expect(row.lastError).not.toMatch(/simulated|message|stack/i);

      const retry = await send({ topic: "app_subscriptions/update", body, eventId });
      expect(retry.status).toBe(200);
      expect(await json(retry)).toEqual({ status: "active" });
      [row] = (await events(shop)).filter((e) => e.eventId === eventId);
      expect(row).toMatchObject({ status: "processed", attempts: 2, lastError: null });
      expect(await prisma.subscription.count({ where: { shopId: shop, status: "active" } })).toBe(
        1,
      );

      expect(await json(await send({ topic: "app_subscriptions/update", body, eventId }))).toEqual({
        duplicate: true,
      });
      await prisma.subscription.deleteMany({ where: { shopId: shop } });
    });

    it("a delivery that arrives while the first is still running gets 409 so Shopify retries", async () => {
      const eventId = randomUUID();
      await prisma.webhookEvent.create({
        data: { shopId: shopA, topic: "products/update", eventId, status: "processing" },
      });
      const response = await send({ topic: "products/update", body: { id: 74 }, eventId });
      expect(response.status).toBe(409);
      expect(await json(response)).toEqual({ inProgress: true });
    });

    it("a run that died without finishing is taken over after the stale timeout, by exactly one retry", async () => {
      const eventId = randomUUID();
      const old = new Date(Date.now() - STALE_AFTER_MS - 60_000);
      const row = await prisma.webhookEvent.create({
        data: {
          shopId: shopA,
          topic: "products/update",
          eventId,
          status: "processing",
          updatedAt: old,
        },
      });
      await prisma.$executeRaw`UPDATE webhook_events SET updated_at = ${old} WHERE id = ${row.id}::uuid`;

      const responses = await Promise.all(
        Array.from({ length: 4 }, () =>
          send({ topic: "products/update", body: { id: 75 }, eventId }),
        ),
      );
      const bodies = await Promise.all(responses.map(json));
      expect(bodies.filter((b) => b.result === "synced")).toHaveLength(1);
      const after = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: row.id } });
      expect(after).toMatchObject({ status: "processed", attempts: 2 });
    });

    it("if the idempotency store is down nothing is processed and Shopify is told to retry", async () => {
      vi.spyOn(prisma.webhookEvent, "create").mockRejectedValueOnce(
        new Error("connection refused"),
      );
      const before = await purchases(bundleA);
      const response = await send({ topic: "orders/paid", body: orderFor(bundleA, 5002) });
      expect(response.status).toBe(500);
      expect(await json(response)).toEqual({});
      expect(await purchases(bundleA)).toBe(before);
    });
  });

  describe("app/uninstalled", () => {
    async function seedShop(domain: string) {
      await prisma.shop.deleteMany({ where: { shopDomain: domain } });
      const shop = await prisma.shop.create({
        data: { shopDomain: domain, accessToken: "encrypted-token-value", email: "u@example.com" },
      });
      await grantPlan(shop.id, "growth");
      const bundle = await prisma.bundle.create({
        data: {
          shopId: shop.id,
          title: "Live",
          bundleType: "fixed",
          discountType: "percentage",
          discountValue: 10,
          status: "active",
          shopifyDiscountId: "gid://shopify/DiscountAutomaticNode/777",
        },
      });
      const draft = await prisma.bundle.create({
        data: {
          shopId: shop.id,
          title: "Draft",
          bundleType: "fixed",
          discountType: "percentage",
          discountValue: 10,
        },
      });
      await prisma.analyticsEvent.create({
        data: {
          shopId: shop.id,
          bundleId: bundle.id,
          eventType: "bundle_view",
          eventKey: randomUUID(),
        },
      });
      return { shop, bundle, draft };
    }

    it("deactivates the shop, wipes the token, ends the paid plan, and keeps every record", async () => {
      const { shop, bundle, draft } = await seedShop("bundlecraft-hook-u1.myshopify.com");
      const session = await createSessionToken(
        { shopId: shop.id, shopDomain: shop.shopDomain },
        process.env.SESSION_SECRET!,
      );
      expect(await getAuthenticatedShop(session)).not.toBeNull();
      await new Promise((r) => setTimeout(r, 1100)); // session iat is whole seconds

      const response = await send({
        topic: "app/uninstalled",
        body: { id: 1 },
        shop: shop.shopDomain,
      });
      expect(response.status).toBe(200);
      expect(await json(response)).toEqual({ uninstalled: true });

      const after = await prisma.shop.findUniqueOrThrow({ where: { id: shop.id } });
      expect(after).toMatchObject({ status: "inactive", plan: "free", accessToken: "" });
      expect(after.uninstalledAt).not.toBeNull();
      expect(await getAuthenticatedShop(session)).toBeNull();

      // Subscription history kept, closed.
      const subs = await prisma.subscription.findMany({ where: { shopId: shop.id } });
      expect(subs).toHaveLength(1);
      expect(subs[0]).toMatchObject({ status: "cancelled" });
      expect(subs[0].cancelledAt).not.toBeNull();

      // Bundles kept: the live one is switched off and forgets its deleted discount; drafts untouched.
      const bundles = await prisma.bundle.findMany({
        where: { shopId: shop.id },
        orderBy: { title: "asc" },
      });
      expect(bundles.map((b) => [b.title, b.status, b.shopifyDiscountId])).toEqual([
        ["Draft", "draft", null],
        ["Live", "inactive", null],
      ]);
      expect(bundles.map((b) => b.id).sort()).toEqual([bundle.id, draft.id].sort());

      // Analytics and the webhook record survive.
      expect(await prisma.analyticsEvent.count({ where: { shopId: shop.id } })).toBe(1);
      expect(
        await prisma.webhookEvent.count({
          where: { shopId: shop.id, topic: "app/uninstalled", status: "processed" },
        }),
      ).toBe(1);
      await prisma.shop.deleteMany({ where: { id: shop.id } });
    });

    it("is idempotent: a repeated uninstall (same or new event id) changes nothing further", async () => {
      const { shop } = await seedShop("bundlecraft-hook-u2.myshopify.com");
      const eventId = randomUUID();
      await send({ topic: "app/uninstalled", body: { id: 1 }, shop: shop.shopDomain, eventId });
      const first = await prisma.shop.findUniqueOrThrow({ where: { id: shop.id } });

      const same = await send({
        topic: "app/uninstalled",
        body: { id: 1 },
        shop: shop.shopDomain,
        eventId,
      });
      const other = await send({
        topic: "app/uninstalled",
        body: { id: 1 },
        shop: shop.shopDomain,
      });
      expect(await json(same)).toEqual({ duplicate: true });
      expect(await json(other)).toEqual({ uninstalled: true });

      const second = await prisma.shop.findUniqueOrThrow({ where: { id: shop.id } });
      expect(second.uninstalledAt?.getTime()).toBe(first.uninstalledAt?.getTime());
      expect(second).toMatchObject({ status: "inactive", accessToken: "", plan: "free" });
      expect(await prisma.subscription.count({ where: { shopId: shop.id } })).toBe(1);
      await prisma.shop.deleteMany({ where: { id: shop.id } });
    });

    it("acknowledges an uninstall for an unknown shop", async () => {
      const response = await send({
        topic: "app/uninstalled",
        body: { id: 1 },
        shop: "never-installed.myshopify.com",
      });
      expect(response.status).toBe(200);
      expect(await json(response)).toEqual({ ignored: true });
    });

    it("cannot affect any other shop", async () => {
      const { shop } = await seedShop("bundlecraft-hook-u3.myshopify.com");
      await send({ topic: "app/uninstalled", body: { id: 1 }, shop: shop.shopDomain });
      expect((await prisma.shop.findUniqueOrThrow({ where: { id: shopA } })).status).toBe("active");
      expect((await prisma.shop.findUniqueOrThrow({ where: { id: shopB } })).status).toBe("active");
      expect((await prisma.bundle.findUniqueOrThrow({ where: { id: bundleA } })).status).toBe(
        "active",
      );
      await prisma.shop.deleteMany({ where: { id: shop.id } });
    });

    it("after uninstall the shop cannot use the merchant API or the storefront, and its old session stays dead after a reinstall", async () => {
      const { shop } = await seedShop("bundlecraft-hook-u4.myshopify.com");
      const cookie = await createSessionToken(
        { shopId: shop.id, shopDomain: shop.shopDomain },
        process.env.SESSION_SECRET!,
      );
      currentCookie = cookie;
      expect(
        (await analyticsOverview(new Request("http://localhost/api/analytics/overview"))).status,
      ).toBe(200);
      await new Promise((r) => setTimeout(r, 1100));

      await send({ topic: "app/uninstalled", body: { id: 1 }, shop: shop.shopDomain });
      expect(
        (await analyticsOverview(new Request("http://localhost/api/analytics/overview"))).status,
      ).toBe(401);

      const query = new URLSearchParams({
        shop: shop.shopDomain,
        path_prefix: "/apps/bundlecraft",
        timestamp: String(Math.floor(Date.now() / 1000)),
      });
      const message = [...query.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, v]) => `${k}=${v}`)
        .join("");
      query.set("signature", createHmac("sha256", SECRET).update(message).digest("hex"));
      expect(
        (await storefrontBundles(new Request(`http://localhost/api/storefront/bundles?${query}`)))
          .status,
      ).toBe(404);

      // Reinstall (what OAuth completion does): the shop is active again, but the pre-uninstall cookie is not.
      await new Promise((r) => setTimeout(r, 1100));
      await prisma.shop.update({
        where: { id: shop.id },
        data: { status: "active", accessToken: "new-encrypted", installedAt: new Date() },
      });
      expect(await getAuthenticatedShop(cookie)).toBeNull();
      const fresh = await createSessionToken(
        { shopId: shop.id, shopDomain: shop.shopDomain },
        process.env.SESSION_SECRET!,
      );
      expect(await getAuthenticatedShop(fresh)).not.toBeNull();
      await prisma.shop.deleteMany({ where: { id: shop.id } });
    });

    it("a late uninstall delivery that predates a reinstall is ignored and does not switch the shop off", async () => {
      const { shop } = await seedShop("bundlecraft-hook-u5.myshopify.com");
      const triggeredAt = new Date(Date.now() - 60_000).toISOString();
      await prisma.shop.update({ where: { id: shop.id }, data: { installedAt: new Date() } }); // reinstalled just now
      const response = await send({
        topic: "app/uninstalled",
        body: { id: 1 },
        shop: shop.shopDomain,
        triggeredAt,
      });
      expect(await json(response)).toEqual({ ignored: "stale" });
      expect((await prisma.shop.findUniqueOrThrow({ where: { id: shop.id } })).status).toBe(
        "active",
      );
      await prisma.shop.deleteMany({ where: { id: shop.id } });
    });
  });

  describe("orders/paid", () => {
    it("records a purchase with revenue from the order, once", async () => {
      const instance = randomUUID();
      const response = await send({
        topic: "orders/paid",
        body: orderFor(bundleA, 6001, [instance]),
      });
      expect(await json(response)).toEqual({ recorded: 1, skipped: 0 });
      const row = await prisma.analyticsEvent.findFirstOrThrow({
        where: { bundleId: bundleA, orderId: "gid://shopify/Order/6001" },
      });
      expect(row.revenue?.toNumber()).toBe(30);
      expect(row).toMatchObject({ shopId: shopA, currency: "USD", eventType: "bundle_purchase" });
    });

    it("records one purchase per bundle instance in a multi-bundle order", async () => {
      const response = await send({
        topic: "orders/paid",
        body: orderFor(bundleA, 6002, [randomUUID(), randomUUID(), randomUUID()]),
      });
      expect(await json(response)).toEqual({ recorded: 3, skipped: 0 });
    });

    it("an order without bundle metadata is acknowledged and records nothing", async () => {
      const before = await prisma.analyticsEvent.count({ where: { shopId: shopA } });
      const response = await send({
        topic: "orders/paid",
        body: {
          id: 6003,
          line_items: [
            {
              quantity: 1,
              price_set: { shop_money: { amount: "9.00", currency_code: "USD" } },
              properties: [],
            },
          ],
        },
      });
      expect(await json(response)).toEqual({ recorded: 0, skipped: 0 });
      expect(await prisma.analyticsEvent.count({ where: { shopId: shopA } })).toBe(before);
    });

    it("the same order under a different event id is still not double counted (the analytics layer dedupes by order and instance)", async () => {
      const order = orderFor(bundleA, 6004, ["11111111-1111-4111-8111-111111111111"]);
      await send({ topic: "orders/paid", body: order });
      const again = await send({ topic: "orders/paid", body: order });
      expect(await json(again)).toEqual({ recorded: 0, skipped: 1 });
    });

    it("revenue comes from the order line money; extra client-style fields change nothing", async () => {
      const order = {
        ...orderFor(bundleA, 6005),
        total_price: "99999.00",
        revenue: 1e6,
        client_revenue: 1e6,
      };
      await send({ topic: "orders/paid", body: order });
      const row = await prisma.analyticsEvent.findFirstOrThrow({
        where: { orderId: "gid://shopify/Order/6005" },
      });
      expect(row.revenue?.toNumber()).toBe(30);
    });
  });

  describe("app_subscriptions/update", () => {
    const gid = (n: number) => `gid://shopify/AppSubscription/${n}`;
    const payload = (n: number, status = "ACTIVE") => ({
      app_subscription: { admin_graphql_api_id: gid(n), status },
    });
    const remote = (
      n: number,
      status: "ACTIVE" | "PENDING" | "CANCELLED" | "EXPIRED" | "FROZEN" | "DECLINED",
      price = 39,
    ) => {
      fakeBilling.subscriptions.set(gid(n), {
        id: gid(n),
        name: "BundleCraft Growth",
        status,
        test: true,
        currentPeriodEnd: null,
        price: { amount: price, currencyCode: "USD", interval: "EVERY_30_DAYS" },
      });
    };
    const seed = (shopId: string, n: number, status: "pending" | "active" = "pending") =>
      prisma.subscription.create({
        data: { shopId, plan: "growth", status, shopifyChargeId: gid(n) },
      });
    afterEach(async () => {
      await prisma.subscription.deleteMany({ where: { shopId: { in: [shopA, shopB] } } });
      await prisma.shop.updateMany({
        where: { id: { in: [shopA, shopB] } },
        data: { plan: "free" },
      });
    });

    it("activates a pending subscription after re-reading Shopify, and a duplicate is a no-op", async () => {
      await seed(shopA, 70001);
      remote(70001, "ACTIVE");
      const eventId = randomUUID();
      expect(
        await json(
          await send({ topic: "app_subscriptions/update", body: payload(70001), eventId }),
        ),
      ).toEqual({ status: "active" });
      expect(
        await json(
          await send({ topic: "app_subscriptions/update", body: payload(70001), eventId }),
        ),
      ).toEqual({ duplicate: true });
      expect((await prisma.shop.findUniqueOrThrow({ where: { id: shopA } })).plan).toBe("growth");
      expect(await prisma.subscription.count({ where: { shopId: shopA, status: "active" } })).toBe(
        1,
      );
    });

    it("maps every Shopify status through the local lifecycle", async () => {
      const expectations: [Parameters<typeof remote>[1], string][] = [
        ["PENDING", "pending"],
        ["CANCELLED", "cancelled"],
        ["DECLINED", "cancelled"],
        ["EXPIRED", "expired"],
        ["FROZEN", "expired"],
      ];
      let n = 70100;
      for (const [shopifyStatus, local] of expectations) {
        n += 1;
        await prisma.subscription.deleteMany({ where: { shopId: shopA } });
        await seed(shopA, n);
        remote(n, shopifyStatus);
        expect(
          await json(
            await send({ topic: "app_subscriptions/update", body: payload(n, shopifyStatus) }),
          ),
          shopifyStatus,
        ).toEqual({ status: local });
      }
    });

    it("the payload cannot choose a plan: a claimed ACTIVE is ignored when Shopify says PENDING or the price differs", async () => {
      await seed(shopA, 70201);
      remote(70201, "PENDING");
      expect(
        await json(
          await send({ topic: "app_subscriptions/update", body: payload(70201, "ACTIVE") }),
        ),
      ).toEqual({ status: "pending" });

      remote(70201, "ACTIVE", 1); // Shopify holds a different price than our Growth plan
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const response = await send({ topic: "app_subscriptions/update", body: payload(70201) });
      expect(response.status).toBe(500);
      expect(
        (await prisma.subscription.findFirstOrThrow({ where: { shopId: shopA } })).status,
      ).toBe("pending");
    });

    it("a subscription that is not this shop's is ignored: shop B cannot move shop A's subscription", async () => {
      await seed(shopA, 70301);
      remote(70301, "ACTIVE");
      const response = await send({
        topic: "app_subscriptions/update",
        body: payload(70301),
        shop: DOMAIN_B,
      });
      expect(await json(response)).toEqual({ ignored: true });
      expect(
        (await prisma.subscription.findFirstOrThrow({ where: { shopId: shopA } })).status,
      ).toBe("pending");
      expect(await prisma.subscription.count({ where: { shopId: shopB } })).toBe(0);
    });

    it("acknowledges an unknown subscription id and rejects malformed ones", async () => {
      expect(
        await json(await send({ topic: "app_subscriptions/update", body: payload(99999999) })),
      ).toEqual({ ignored: true });
      for (const bad of [
        { app_subscription: { admin_graphql_api_id: "42" } },
        { app_subscription: { admin_graphql_api_id: "gid://shopify/AppSubscription/x; DROP" } },
        {},
      ]) {
        expect(await json(await send({ topic: "app_subscriptions/update", body: bad }))).toEqual({
          ignored: true,
        });
      }
    });
  });

  describe("products/*", () => {
    const productRow = (id: string) =>
      prisma.product.findUnique({
        where: { shopId_shopifyProductId: { shopId: shopA, shopifyProductId: id } },
        include: { variants: true },
      });

    it("create and update fetch the authoritative product from Shopify and store it with its variants", async () => {
      fakeCatalog.set({
        id: 880001,
        title: "Linen Shirt",
        variants: [
          { id: 8800011, title: "S", price: "45.00" },
          { id: 8800012, title: "M", price: "45.00", availableForSale: false },
        ],
      });
      for (const topic of ["products/create", "products/update"]) {
        const response = await send({
          topic,
          body: { id: 880001, title: "IGNORED", variants: [] },
        });
        expect(response.status, topic).toBe(200);
        expect(await json(response)).toEqual({
          topic,
          resourceId: "gid://shopify/Product/880001",
          result: "synced",
          variants: 2,
        });
      }
      const row = await productRow("880001");
      expect(row).toMatchObject({ title: "Linen Shirt", status: "active" });
      expect(row?.variants.map((v) => [v.shopifyVariantId, v.availableForSale]).sort()).toEqual([
        ["8800011", true],
        ["8800012", false],
      ]);
    });

    it("the payload is never the source of product data: a lying webhook body changes nothing", async () => {
      fakeCatalog.set({ id: 880002, title: "Real Title" });
      await send({
        topic: "products/update",
        body: { id: 880002, title: "Fake Title From Payload", status: "archived" },
      });
      expect(await productRow("880002")).toMatchObject({ title: "Real Title", status: "active" });
    });

    it("an update refreshes changed fields, adds new variants and marks removed ones", async () => {
      fakeCatalog.set({
        id: 880003,
        title: "Before",
        updatedAt: "2026-09-01T10:00:00Z",
        variants: [
          { id: 1, title: "A" },
          { id: 2, title: "B" },
        ],
      });
      await send({ topic: "products/create", body: { id: 880003 } });
      fakeCatalog.set({
        id: 880003,
        title: "After",
        updatedAt: "2026-09-02T10:00:00Z",
        variants: [
          { id: 2, title: "B2", price: "25.00" },
          { id: 3, title: "C" },
        ],
      });
      await send({ topic: "products/update", body: { id: 880003 } });

      const row = await productRow("880003");
      expect(row?.title).toBe("After");
      const byId = Object.fromEntries((row?.variants ?? []).map((v) => [v.shopifyVariantId, v]));
      expect(byId["2"]).toMatchObject({ title: "B2", removedAt: null });
      expect(byId["2"].price?.toFixed(2)).toBe("25.00");
      expect(byId["3"]).toMatchObject({ title: "C", removedAt: null });
      expect(byId["1"].removedAt).not.toBeNull(); // no longer in Shopify: kept, unsellable
      expect(byId["1"].availableForSale).toBe(false);
    });

    it("delete keeps the row, marked deleted; a product never synced leaves a tombstone", async () => {
      fakeCatalog.set({ id: 880004 });
      await send({ topic: "products/create", body: { id: 880004 } });
      const deleted = await send({ topic: "products/delete", body: { id: 880004 } });
      expect(await json(deleted)).toEqual({
        topic: "products/delete",
        resourceId: "gid://shopify/Product/880004",
        deleted: true,
      });
      const row = await productRow("880004");
      expect(row).toMatchObject({ status: "deleted" });
      expect(row?.deletedAt).not.toBeNull();
      expect(row?.variants).toHaveLength(1); // history kept

      await send({ topic: "products/delete", body: { id: 880005 } });
      expect(await productRow("880005")).toMatchObject({ status: "deleted" });
    });

    it("a deleted product is never revived by a later create or update", async () => {
      fakeCatalog.set({ id: 880006 });
      await send({ topic: "products/create", body: { id: 880006 } });
      await send({ topic: "products/delete", body: { id: 880006 } });
      fakeCatalog.set({ id: 880006, updatedAt: "2027-01-01T00:00:00Z" });
      await send({ topic: "products/update", body: { id: 880006 } });
      expect(await productRow("880006")).toMatchObject({ status: "deleted" });
    });

    it("an update for a product Shopify no longer has marks it deleted", async () => {
      fakeCatalog.set({ id: 880007 });
      await send({ topic: "products/create", body: { id: 880007 } });
      fakeCatalog.autoCreate = false;
      fakeCatalog.remove(880007);
      const response = await send({ topic: "products/update", body: { id: 880007 } });
      expect(await json(response)).toMatchObject({ result: "deleted" });
      expect(await productRow("880007")).toMatchObject({ status: "deleted" });
    });

    it("a Shopify failure fails the event (so it is retried), and the retry then syncs it", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      fakeCatalog.set({ id: 880008 });
      const eventId = randomUUID();
      fakeCatalog.failNext("fetchProduct");
      const failed = await send({ topic: "products/update", body: { id: 880008 }, eventId });
      expect(failed.status).toBe(500);
      expect(await json(failed)).toEqual({});
      expect(await productRow("880008")).toBeNull();
      const [row] = (await events(shopA)).filter((e) => e.eventId === eventId);
      expect(row).toMatchObject({ status: "failed", resourceId: "gid://shopify/Product/880008" });

      const retry = await send({ topic: "products/update", body: { id: 880008 }, eventId });
      expect(retry.status).toBe(200);
      expect(await productRow("880008")).toMatchObject({ status: "active" });
    });

    it("a duplicate delivery is a no-op; malformed payloads are ignored and record nothing", async () => {
      fakeCatalog.set({ id: 880009 });
      const eventId = randomUUID();
      await send({ topic: "products/update", body: { id: 880009 }, eventId });
      expect(
        await json(await send({ topic: "products/update", body: { id: 880009 }, eventId })),
      ).toEqual({ duplicate: true });
      expect((await events(shopA)).filter((e) => e.eventId === eventId)).toHaveLength(1);
      expect(
        await prisma.product.count({ where: { shopId: shopA, shopifyProductId: "880009" } }),
      ).toBe(1);

      const before = (await events(shopA)).length;
      for (const bad of [{}, { id: "abc" }, { id: -4 }, [], "x"]) {
        expect(await json(await send({ topic: "products/create", body: bad }))).toEqual({
          ignored: true,
        });
      }
      expect((await events(shopA)).length).toBe(before);
    });

    it("concurrent deliveries of the same product event store one product and one set of variants", async () => {
      fakeCatalog.set({ id: 880010, variants: [{ id: 5 }, { id: 6 }] });
      const eventId = randomUUID();
      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          send({ topic: "products/update", body: { id: 880010 }, eventId }),
        ),
      );
      expect(
        (await Promise.all(responses.map(json))).filter((b) => b.result === "synced"),
      ).toHaveLength(1);
      expect(
        await prisma.product.count({ where: { shopId: shopA, shopifyProductId: "880010" } }),
      ).toBe(1);
      expect(
        await prisma.productVariant.count({
          where: { shopId: shopA, product: { shopifyProductId: "880010" } },
        }),
      ).toBe(2);
    });

    it("product events touch no bundle rows", async () => {
      const before = await prisma.bundle.findUniqueOrThrow({ where: { id: bundleA } });
      await send({ topic: "products/delete", body: { id: 880011 } });
      const after = await prisma.bundle.findUniqueOrThrow({ where: { id: bundleA } });
      expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    });

    it("one shop's product event never writes into another shop's catalog", async () => {
      fakeCatalog.set({ id: 880012 });
      await send({ topic: "products/create", body: { id: 880012 }, shop: DOMAIN_B });
      expect(
        await prisma.product.count({ where: { shopId: shopA, shopifyProductId: "880012" } }),
      ).toBe(0);
      expect(
        await prisma.product.count({ where: { shopId: shopB, shopifyProductId: "880012" } }),
      ).toBe(1);
    });
  });

  describe("logging and responses", () => {
    it("logs one structured line per webhook with identifiers and outcome, never secrets, signatures or payload data", async () => {
      const lines: string[] = [];
      for (const level of ["info", "warn", "error"] as const) {
        vi.spyOn(console, level).mockImplementation((line: unknown) => {
          lines.push(String(line));
        });
      }
      const eventId = randomUUID();
      const body = orderFor(bundleA, 7001);
      const raw = JSON.stringify(body);
      const hmac = createHmac("sha256", SECRET).update(raw).digest("base64");
      await send({ topic: "orders/paid", body, eventId, hmac });
      await send({ topic: "orders/paid", body, eventId, hmac }); // duplicate
      await send({ topic: "orders/paid", body, hmac: "AAAA" }); // rejected

      const parsed = lines
        .map((l) => JSON.parse(l) as Record<string, unknown>)
        .filter((l) => l.webhook);
      expect(parsed.map((l) => l.outcome)).toEqual(["processed", "duplicate", "rejected"]);
      expect(parsed[0]).toMatchObject({
        topic: "orders/paid",
        shopDomain: DOMAIN_A,
        eventId,
        status: 200,
      });
      expect(parsed[0].requestId).toBeTruthy();
      expect(typeof parsed[0].durationMs).toBe("number");
      expect(parsed[2]).toMatchObject({ status: 401, errorCode: "INVALID_SIGNATURE" });
      // Before the signature is verified nothing from the request is echoed into logs.
      expect(parsed[2]).not.toHaveProperty("shopDomain");
      expect(parsed[2]).not.toHaveProperty("eventId");

      const all = lines.join("\n");
      expect(all).not.toContain(hmac);
      expect(all).not.toContain(SECRET);
      expect(all).not.toContain("customer@example.com");
      expect(all).not.toContain("_bundle_instance_id");
      expect(all).not.toMatch(/shpat_|enc-token/);
    });

    it("failed processing is logged as a failure with a short code, and answered with an empty body", async () => {
      const lines: string[] = [];
      vi.spyOn(console, "error").mockImplementation((line: unknown) => {
        lines.push(String(line));
      });
      vi.spyOn(prisma.analyticsEvent, "createMany").mockRejectedValueOnce(
        new Error("db exploded: postgres://user:pw@host"),
      );
      const response = await send({
        topic: "orders/paid",
        body: orderFor(bundleA, 7002, [randomUUID()]),
      });
      expect(response.status).toBe(500);
      expect(await response.text()).toBe("{}");
      const entry = JSON.parse(lines[0]) as Record<string, unknown>;
      expect(entry).toMatchObject({ outcome: "failed", status: 500, errorCode: "HANDLER_FAILED" });
      expect(lines.join("")).not.toMatch(/postgres|exploded|pw@/);
    });

    it("never returns internals on any path", async () => {
      const responses = await Promise.all([
        send({ topic: "products/update", body: { id: 1 }, secret: "x" }),
        send({ topic: "products/update", body: { id: 1 } }),
        send({ topic: "products/update", body: { bad: 1 } }),
        send({ topic: "products/update", body: null, rawBody: "{oops" }),
      ]);
      for (const r of responses) {
        expect(await r.text()).not.toMatch(
          /prisma|stack|postgres|shpat_|SESSION_SECRET|at .*:\d+:\d+/i,
        );
      }
    });
  });
});
