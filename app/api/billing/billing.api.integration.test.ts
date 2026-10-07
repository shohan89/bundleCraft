// @vitest-environment node
import "dotenv/config";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CSRF_HEADER, CSRF_HEADER_VALUE } from "@/lib/api/csrf";
import { createSessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { fakeBilling } from "@/services/billing/test-instance";
import { grantPlan } from "@/services/billing/testing";
import { POST as appSubscriptionsUpdate } from "../webhooks/app-subscriptions-update/route";
import { GET as analyticsOverview } from "../analytics/overview/route";
import { GET as callbackRoute } from "./callback/route";
import { POST as cancelRoute } from "./cancel/route";
import { POST as createRoute } from "./create/route";
import { GET as currentRoute } from "./current/route";

// Shopify is never called: billing runs against an in-memory fake.
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
  Boolean(process.env.DATABASE_URL) &&
  Boolean(process.env.SESSION_SECRET) &&
  Boolean(process.env.SHOPIFY_APP_URL) &&
  Boolean(process.env.SHOPIFY_API_KEY) &&
  Boolean(SECRET);
const DOMAIN_A = "bundlecraft-billing-api-a.myshopify.com";
const DOMAIN_B = "bundlecraft-billing-api-b.myshopify.com";
const BASE = "http://localhost/api/billing";

interface Envelope {
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
}
const json = async (response: Response) => (await response.json()) as Envelope;

const post = (
  handler: (r: Request) => Promise<Response>,
  path: string,
  body?: unknown,
  csrf = true,
) =>
  handler(
    new Request(`${BASE}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(csrf ? { [CSRF_HEADER]: CSRF_HEADER_VALUE } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
const get = (handler: (r: Request) => Promise<Response>, path: string) =>
  handler(new Request(`${BASE}${path}`));

describe.skipIf(!canRun)("billing API (live database, fake Shopify)", () => {
  let shopA: string;
  let shopB: string;
  let cookieA: string;
  let cookieB: string;

  const subs = (shopId: string) => prisma.subscription.findMany({ where: { shopId } });

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
    const secret = process.env.SESSION_SECRET!;
    cookieA = await createSessionToken({ shopId: shopA, shopDomain: DOMAIN_A }, secret);
    cookieB = await createSessionToken({ shopId: shopB, shopDomain: DOMAIN_B }, secret);
  });

  afterAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    fakeBilling.reset();
    currentCookie = cookieA;
    await prisma.subscription.deleteMany({ where: { shopId: { in: [shopA, shopB] } } });
    await prisma.shop.updateMany({ where: { id: { in: [shopA, shopB] } }, data: { plan: "free" } });
  });

  describe("authentication and request hygiene", () => {
    it("rejects every billing endpoint with 401 when there is no session", async () => {
      currentCookie = undefined;
      const responses = await Promise.all([
        post(createRoute, "/create", { plan: "starter" }),
        get(currentRoute, "/current"),
        post(cancelRoute, "/cancel"),
      ]);
      for (const response of responses) {
        expect(response.status).toBe(401);
        expect((await json(response)).error?.code).toBe("UNAUTHORIZED");
      }
      expect(fakeBilling.calls).toEqual([]);
    });

    it("rejects a forged or tampered session", async () => {
      currentCookie = `${cookieA}x`;
      expect((await get(currentRoute, "/current")).status).toBe(401);
      currentCookie = "garbage";
      expect((await post(createRoute, "/create", { plan: "starter" })).status).toBe(401);
    });

    it("requires the CSRF header on state-changing calls", async () => {
      expect((await post(createRoute, "/create", { plan: "starter" }, false)).status).toBe(403);
      expect((await post(cancelRoute, "/cancel", undefined, false)).status).toBe(403);
      expect(await subs(shopA)).toHaveLength(0);
    });
  });

  describe("POST /api/billing/create", () => {
    it("returns Shopify's approval url and creates a pending subscription", async () => {
      const response = await post(createRoute, "/create", { plan: "growth" });
      expect(response.status).toBe(200);
      const { data } = await json(response);
      expect(data).toMatchObject({ plan: "growth", resumed: false });
      expect(String(data?.confirmationUrl)).toMatch(/^https:\/\//);
      expect(await subs(shopA)).toMatchObject([{ plan: "growth", status: "pending" }]);
    });

    it("rejects an invalid plan, free, malformed bodies, and non-JSON with 400 and calls Shopify not at all", async () => {
      for (const body of [
        { plan: "platinum" },
        { plan: "free" },
        {},
        { plan: 5 },
        null,
        "starter",
      ]) {
        const response = await post(createRoute, "/create", body);
        expect(response.status).toBe(400);
        expect(["INVALID_PLAN", "INVALID_REQUEST"]).toContain((await json(response)).error?.code);
      }
      const bad = await createRoute(
        new Request(`${BASE}/create`, {
          method: "POST",
          headers: { [CSRF_HEADER]: CSRF_HEADER_VALUE },
          body: "not json",
        }),
      );
      expect(bad.status).toBe(400);
      expect(fakeBilling.calls).toEqual([]);
    });

    it("ignores a forged price: the server charges its own config, and forged fields are rejected", async () => {
      for (const extra of [
        { price: 0 },
        { amount: 0.01 },
        { shopId: shopB },
        { status: "active" },
      ]) {
        const response = await post(createRoute, "/create", { plan: "pro", ...extra });
        expect(response.status).toBe(400);
      }
      expect(fakeBilling.created).toHaveLength(0);

      await post(createRoute, "/create", { plan: "pro" });
      expect(fakeBilling.created[0]).toMatchObject({ amount: 79, name: "BundleCraft Pro" });
    });

    it("cannot be pointed at another shop: the subscription belongs to the session's shop", async () => {
      await post(createRoute, "/create", { plan: "starter", shopId: shopB });
      expect(await subs(shopB)).toHaveLength(0);
      await post(createRoute, "/create", { plan: "starter" });
      expect(await subs(shopA)).toHaveLength(1);
      expect(await subs(shopB)).toHaveLength(0);
    });

    it("repeated requests reuse the pending charge; an owned plan is refused with 409", async () => {
      await post(createRoute, "/create", { plan: "starter" });
      const again = await post(createRoute, "/create", { plan: "starter" });
      expect((await json(again)).data).toMatchObject({ resumed: true });
      expect(fakeBilling.created).toHaveLength(1);

      const [{ shopifyChargeId }] = await subs(shopA);
      fakeBilling.approve(shopifyChargeId);
      await get(currentRoute, "/current"); // page load verifies and activates
      const owned = await post(createRoute, "/create", { plan: "starter" });
      expect(owned.status).toBe(409);
      expect((await json(owned)).error?.code).toBe("SUBSCRIPTION_ALREADY_ACTIVE");
    });

    it("turns a Shopify failure into a safe 502 without leaking detail", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      fakeBilling.failNext("createSubscription", new Error("boom shpat_secret stack"));
      const response = await post(createRoute, "/create", { plan: "starter" });
      expect(response.status).toBe(502);
      const body = await json(response);
      expect(body.error?.code).toBe("BILLING_CREATION_FAILED");
      expect(JSON.stringify(body)).not.toMatch(/boom|shpat|stack|prisma/i);
    });
  });

  describe("GET /api/billing/current", () => {
    it("reports Free for a shop with no subscription", async () => {
      const { data } = await json(await get(currentRoute, "/current"));
      expect(data).toMatchObject({ plan: "free", status: "active", subscription: null });
    });

    it("reports each shop's own plan and never the other's", async () => {
      await grantPlan(shopA, "pro");
      const a = await json(await get(currentRoute, "/current"));
      expect(a.data).toMatchObject({
        plan: "pro",
        subscription: { plan: "pro", status: "active" },
      });

      currentCookie = cookieB;
      const b = await json(await get(currentRoute, "/current"));
      expect(b.data).toMatchObject({ plan: "free", subscription: null });
    });

    it("exposes no shop id, charge id, confirmation url or tokens", async () => {
      await post(createRoute, "/create", { plan: "starter" });
      const [{ shopifyChargeId, confirmationUrl }] = await subs(shopA);
      const text = JSON.stringify(await json(await get(currentRoute, "/current")));
      expect(text).not.toContain(shopifyChargeId);
      expect(text).not.toContain(confirmationUrl!);
      expect(text).not.toContain(shopA);
      expect(text).not.toMatch(/accessToken|shopifyChargeId|shopId|confirmationUrl/);
    });
  });

  describe("POST /api/billing/cancel", () => {
    it("cancels the session shop's subscription; a repeat is a clean 404", async () => {
      await post(createRoute, "/create", { plan: "growth" });
      const [{ shopifyChargeId }] = await subs(shopA);
      fakeBilling.approve(shopifyChargeId);
      await get(currentRoute, "/current");

      const done = await post(cancelRoute, "/cancel");
      expect(done.status).toBe(200);
      expect((await json(done)).data).toEqual({ plan: "free", status: "cancelled" });

      const repeat = await post(cancelRoute, "/cancel");
      expect(repeat.status).toBe(404);
      expect((await json(repeat)).error?.code).toBe("SUBSCRIPTION_NOT_FOUND");
      expect(await subs(shopA)).toHaveLength(1);
    });

    it("shop B cannot cancel shop A's subscription, whatever it sends", async () => {
      await grantPlan(shopA, "pro");
      currentCookie = cookieB;
      const response = await post(cancelRoute, "/cancel", { shopId: shopA });
      expect(response.status).toBe(404);
      expect((await subs(shopA))[0].status).toBe("active");
      expect(fakeBilling.calls).toEqual([]);
    });
  });

  describe("GET /api/billing/callback (Shopify's return)", () => {
    const callback = (query: string, cookie: string | null = cookieA) =>
      callbackRoute(
        new NextRequest(`http://localhost/api/billing/callback${query}`, {
          headers: cookie ? { cookie: `bundlecraft_session=${cookie}` } : {},
        }),
      );
    const outcome = (response: Response) =>
      new URL(response.headers.get("location")!).searchParams.get("billing");
    const idOf = (gid: string) => gid.split("/").pop()!;

    it("verifies with Shopify, activates the plan, and returns the merchant to the billing page", async () => {
      await post(createRoute, "/create", { plan: "growth" });
      const [{ shopifyChargeId }] = await subs(shopA);
      fakeBilling.approve(shopifyChargeId);

      const response = await callback(`?charge_id=${idOf(shopifyChargeId)}`);
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      expect(location.hostname).toBe(DOMAIN_A);
      expect(location.pathname).toContain("/dashboard/billing");
      expect(outcome(response)).toBe("success");
      expect((await subs(shopA))[0].status).toBe("active");
    });

    it("does not activate just because the browser came back: an unapproved charge stays pending", async () => {
      await post(createRoute, "/create", { plan: "growth" });
      const [{ shopifyChargeId }] = await subs(shopA);
      const response = await callback(`?charge_id=${idOf(shopifyChargeId)}`);
      expect(outcome(response)).toBe("pending");
      expect((await subs(shopA))[0].status).toBe("pending");
    });

    it("reports a declined approval and leaves the shop on Free", async () => {
      await post(createRoute, "/create", { plan: "growth" });
      const [{ shopifyChargeId }] = await subs(shopA);
      fakeBilling.setStatus(shopifyChargeId, "DECLINED");
      expect(outcome(await callback(`?charge_id=${idOf(shopifyChargeId)}`))).toBe("declined");
      expect((await subs(shopA))[0].status).toBe("cancelled");
      const { data } = await json(await get(currentRoute, "/current"));
      expect(data?.plan).toBe("free");
    });

    it("is safe to replay", async () => {
      await post(createRoute, "/create", { plan: "starter" });
      const [{ shopifyChargeId }] = await subs(shopA);
      fakeBilling.approve(shopifyChargeId);
      const q = `?charge_id=${idOf(shopifyChargeId)}`;
      expect(outcome(await callback(q))).toBe("success");
      expect(outcome(await callback(q))).toBe("success");
      expect(await subs(shopA)).toHaveLength(1);
    });

    it("rejects invalid, missing, unknown and other shops' charge ids without changing anything", async () => {
      await post(createRoute, "/create", { plan: "starter" });
      const [{ shopifyChargeId }] = await subs(shopA);
      fakeBilling.approve(shopifyChargeId);

      for (const query of ["", "?charge_id=abc", "?charge_id=999999999999", "?charge_id=1;drop"]) {
        expect(outcome(await callback(query))).toBe("error");
      }
      // Shop B presenting shop A's real, approved charge id.
      const foreign = await callback(`?charge_id=${idOf(shopifyChargeId)}`, cookieB);
      expect(outcome(foreign)).toBe("error");
      expect(new URL(foreign.headers.get("location")!).hostname).toBe(DOMAIN_B);
      expect((await subs(shopA))[0].status).toBe("pending");
      expect(await subs(shopB)).toHaveLength(0);
    });

    it("without a valid session, redirects to sign-in instead of acting", async () => {
      await post(createRoute, "/create", { plan: "starter" });
      const [{ shopifyChargeId }] = await subs(shopA);
      fakeBilling.approve(shopifyChargeId);
      const response = await callback(`?charge_id=${idOf(shopifyChargeId)}`, null);
      expect(new URL(response.headers.get("location")!).pathname).toBe("/api/auth/shopify");
      expect((await subs(shopA))[0].status).toBe("pending");
    });

    it("shows an error, and keeps the plan, when Shopify can't confirm", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      await post(createRoute, "/create", { plan: "starter" });
      const [{ shopifyChargeId }] = await subs(shopA);
      fakeBilling.approve(shopifyChargeId);
      fakeBilling.failNext("getSubscription");
      expect(outcome(await callback(`?charge_id=${idOf(shopifyChargeId)}`))).toBe("error");
      expect((await subs(shopA))[0].status).toBe("pending");
    });
  });

  describe("POST /api/webhooks/app-subscriptions-update", () => {
    const send = (
      payload: unknown,
      over: { secret?: string; shop?: string; topic?: string; hmac?: string } = {},
    ) => {
      const body = typeof payload === "string" ? payload : JSON.stringify(payload);
      return appSubscriptionsUpdate(
        new Request("http://localhost/api/webhooks/app-subscriptions-update", {
          method: "POST",
          body,
          headers: {
            "x-shopify-hmac-sha256":
              over.hmac ??
              createHmac("sha256", over.secret ?? SECRET)
                .update(body)
                .digest("base64"),
            "x-shopify-shop-domain": over.shop ?? DOMAIN_A,
            "x-shopify-topic": over.topic ?? "app_subscriptions/update",
          },
        }),
      );
    };
    const payloadFor = (gid: string, status = "ACTIVE") => ({
      app_subscription: { admin_graphql_api_id: gid, status },
    });

    it("re-verifies with Shopify and activates an approved subscription", async () => {
      await post(createRoute, "/create", { plan: "growth" });
      const [{ shopifyChargeId }] = await subs(shopA);
      fakeBilling.approve(shopifyChargeId);
      const response = await send(payloadFor(shopifyChargeId));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "active" });
      expect((await subs(shopA))[0].status).toBe("active");
    });

    it("cannot set a plan by itself: a payload claiming ACTIVE is ignored if Shopify says PENDING", async () => {
      await post(createRoute, "/create", { plan: "pro" });
      const [{ shopifyChargeId }] = await subs(shopA);
      const response = await send(payloadFor(shopifyChargeId, "ACTIVE"));
      expect(await response.json()).toEqual({ status: "pending" });
      expect((await subs(shopA))[0].status).toBe("pending");
    });

    it("handles a cancellation made in the Shopify admin, and a redelivery", async () => {
      await grantPlan(shopA, "starter");
      const [{ shopifyChargeId }] = await subs(shopA);
      fakeBilling.subscriptions.set(shopifyChargeId, {
        id: shopifyChargeId,
        name: "BundleCraft Starter",
        status: "CANCELLED",
        test: true,
        currentPeriodEnd: null,
        price: { amount: 19, currencyCode: "USD", interval: "EVERY_30_DAYS" },
      });
      await send(payloadFor(shopifyChargeId, "CANCELLED"));
      await send(payloadFor(shopifyChargeId, "CANCELLED"));
      expect((await subs(shopA))[0].status).toBe("cancelled");
      expect((await prisma.shop.findUniqueOrThrow({ where: { id: shopA } })).plan).toBe("free");
    });

    it("rejects a bad signature with 401 and changes nothing", async () => {
      await post(createRoute, "/create", { plan: "growth" });
      const [{ shopifyChargeId }] = await subs(shopA);
      fakeBilling.approve(shopifyChargeId);
      const payload = payloadFor(shopifyChargeId);
      expect((await send(payload, { secret: "wrong" })).status).toBe(401);
      expect((await send(payload, { hmac: "" })).status).toBe(401);
      expect((await subs(shopA))[0].status).toBe("pending");
    });

    it("takes the shop from the verified header: another shop's webhook can't touch this shop's subscription", async () => {
      await post(createRoute, "/create", { plan: "growth" });
      const [{ shopifyChargeId }] = await subs(shopA);
      fakeBilling.approve(shopifyChargeId);
      const response = await send(payloadFor(shopifyChargeId), { shop: DOMAIN_B });
      expect(await response.json()).toEqual({ ignored: true });
      expect((await subs(shopA))[0].status).toBe("pending");
    });

    it("acknowledges without acting on other topics, unknown shops, unknown charges and junk", async () => {
      const gid = "gid://shopify/AppSubscription/1";
      for (const over of [
        { topic: "orders/create" },
        { shop: "nobody.myshopify.com" },
        { shop: "evil.example.com" },
      ]) {
        expect(await (await send(payloadFor(gid), over)).json()).toEqual({ ignored: true });
      }
      expect(await (await send(payloadFor(gid))).json()).toEqual({ ignored: true });
      expect(await (await send({ nonsense: true })).json()).toEqual({ ignored: true });
      expect((await send("not json")).status).toBe(400);
    });

    it("returns 500 so Shopify retries when it can't verify right now", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      await post(createRoute, "/create", { plan: "starter" });
      const [{ shopifyChargeId }] = await subs(shopA);
      fakeBilling.failNext("getSubscription");
      expect((await send(payloadFor(shopifyChargeId))).status).toBe(500);
    });
  });

  describe("plan gating on other APIs", () => {
    it("analytics API refuses a Free shop with PLAN_FEATURE_UNAVAILABLE and serves a Growth shop", async () => {
      const denied = await get(analyticsOverview, "/../analytics/overview");
      expect(denied.status).toBe(403);
      expect((await json(denied)).error?.code).toBe("PLAN_FEATURE_UNAVAILABLE");

      await grantPlan(shopA, "growth");
      expect((await get(analyticsOverview, "/../analytics/overview")).status).toBe(200);
    });

    it("a client cannot grant itself a plan by sending one: only verified subscriptions count", async () => {
      const response = await analyticsOverview(
        new Request("http://localhost/api/analytics/overview?plan=pro&shopId=" + shopB, {
          headers: { "x-plan": "pro" },
        }),
      );
      expect(response.status).toBe(403);
    });
  });
});
