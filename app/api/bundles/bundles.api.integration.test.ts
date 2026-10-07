// @vitest-environment node
import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CSRF_HEADER, CSRF_HEADER_VALUE } from "@/lib/api/guard";
import { createSessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { GET as listRoute, POST as createRoute } from "./route";
import { DELETE, GET as getRoute, PATCH, PUT } from "./[id]/route";
import { POST as deactivateRoute } from "./[id]/deactivate/route";
import { POST as duplicateRoute } from "./[id]/duplicate/route";
import { POST as publishRoute } from "./[id]/publish/route";
import { POST as validateRoute } from "./[id]/validate/route";
import { grantPlan } from "@/services/billing/testing";
import { seedCatalog } from "@/services/products/testing";

// Route handlers read the session from next/headers' cookie store. Each
// test decides which cookie (if any) the "browser" sends.
let currentCookie: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "bundlecraft_session" && currentCookie ? { name, value: currentCookie } : undefined,
  }),
}));

// Shopify is never called from tests: discount sync runs against an in-memory fake.
vi.mock("@/services/discounts/gateway", async () => {
  const { fakeGateway } = await import("@/services/discounts/test-instance");
  return { openDiscountGateway: async () => fakeGateway };
});

const canRun = Boolean(process.env.DATABASE_URL) && Boolean(process.env.SESSION_SECRET);
const DOMAIN_A = "bundlecraft-api-test-a.myshopify.com";
const DOMAIN_B = "bundlecraft-api-test-b.myshopify.com";
const BASE = "http://localhost/api/bundles";

const validBody = {
  title: "API Bundle",
  bundleType: "fixed",
  discountType: "percentage",
  discountValue: 20,
  products: [{ shopifyProductId: "1001", shopifyVariantId: "2001", quantity: 1 }],
};

function call(
  handler: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>,
  method: string,
  url: string,
  options: { body?: unknown; rawBody?: string; csrf?: boolean; id?: string } = {},
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.csrf !== false) headers[CSRF_HEADER] = CSRF_HEADER_VALUE;
  const request = new Request(url, {
    method,
    headers,
    body:
      options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
  });
  return handler(request, { params: Promise.resolve({ id: options.id ?? "" }) });
}

async function json(response: Response) {
  return (await response.json()) as {
    success: boolean;
    data?: {
      bundle: { id: string; title: string; status: string };
      bundles: { id: string }[];
      valid?: boolean;
      errors?: unknown[];
    };
    error?: { code: string; message: string; details?: { field: string }[] };
  };
}

describe.skipIf(!canRun)("bundle API routes (live database)", () => {
  let cookieA: string;
  let cookieB: string;

  beforeAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    const a = await prisma.shop.create({
      data: { shopDomain: DOMAIN_A, accessToken: "x", email: "a@example.com" },
    });
    const b = await prisma.shop.create({
      data: { shopDomain: DOMAIN_B, accessToken: "x", email: "b@example.com" },
    });
    await grantPlan(a.id, "pro");
    await grantPlan(b.id, "pro");
    for (const shop of [a.id, b.id]) {
      await seedCatalog(shop, [{ productId: "1001", variantId: "2001" }]);
    }
    const secret = process.env.SESSION_SECRET!;
    cookieA = await createSessionToken({ shopId: a.id, shopDomain: DOMAIN_A }, secret);
    cookieB = await createSessionToken({ shopId: b.id, shopDomain: DOMAIN_B }, secret);
  });

  beforeEach(() => {
    currentCookie = cookieA;
  });

  afterAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    await prisma.$disconnect();
  });

  async function createAs(cookie: string, body: object = validBody): Promise<string> {
    currentCookie = cookie;
    const response = await call(createRoute, "POST", BASE, { body });
    expect(response.status).toBe(201);
    return (await json(response)).data!.bundle.id;
  }

  describe("authentication", () => {
    it("rejects every endpoint with 401 when there is no session", async () => {
      currentCookie = undefined;
      const id = "5f0c6a6e-8f0e-4c53-9b64-6f7f3f2b9a11";

      const responses = await Promise.all([
        call(listRoute, "GET", BASE),
        call(createRoute, "POST", BASE, { body: validBody }),
        call(getRoute, "GET", `${BASE}/${id}`, { id }),
        call(PATCH, "PATCH", `${BASE}/${id}`, { id, body: { title: "x" } }),
        call(DELETE, "DELETE", `${BASE}/${id}`, { id }),
        call(publishRoute, "POST", `${BASE}/${id}/publish`, { id }),
        call(deactivateRoute, "POST", `${BASE}/${id}/deactivate`, { id }),
        call(validateRoute, "POST", `${BASE}/${id}/validate`, { id }),
        call(duplicateRoute, "POST", `${BASE}/${id}/duplicate`, { id }),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(401);
        expect((await json(response)).error?.code).toBe("UNAUTHORIZED");
      }
    });

    it("rejects a forged/tampered session cookie", async () => {
      currentCookie = `${cookieA.slice(0, -3)}abc`;
      expect((await call(listRoute, "GET", BASE)).status).toBe(401);
    });

    it("accepts an authenticated shop", async () => {
      const response = await call(listRoute, "GET", BASE);
      expect(response.status).toBe(200);
      expect((await json(response)).success).toBe(true);
    });
  });

  describe("CSRF protection", () => {
    it("rejects mutating requests without the custom header (403), but not reads", async () => {
      expect((await call(createRoute, "POST", BASE, { body: validBody, csrf: false })).status).toBe(
        403,
      );
      expect((await call(listRoute, "GET", BASE, { csrf: false })).status).toBe(200);
    });
  });

  describe("create + read", () => {
    it("creates a draft (201) and returns it via GET, without exposing internals", async () => {
      const id = await createAs(cookieA);
      const response = await call(getRoute, "GET", `${BASE}/${id}`, { id });
      const body = await json(response);

      expect(response.status).toBe(200);
      expect(body.data!.bundle).toMatchObject({ id, title: "API Bundle", status: "draft" });
      expect(JSON.stringify(body)).not.toMatch(/shopId|accessToken|shpat_|shpss_/);
    });

    it("lists only the calling shop's bundles", async () => {
      const mine = await createAs(cookieA, { ...validBody, title: "Mine" });
      const theirs = await createAs(cookieB, { ...validBody, title: "Theirs" });

      currentCookie = cookieA;
      const ids = (await json(await call(listRoute, "GET", BASE))).data!.bundles.map((b) => b.id);
      expect(ids).toContain(mine);
      expect(ids).not.toContain(theirs);
    });
  });

  describe("request validation", () => {
    it("400 for malformed JSON and for a non-UUID id", async () => {
      const bad = await call(createRoute, "POST", BASE, { rawBody: "{not json" });
      expect(bad.status).toBe(400);
      expect((await json(bad)).error?.code).toBe("INVALID_REQUEST");

      const badId = await call(getRoute, "GET", `${BASE}/nope`, { id: "nope" });
      expect(badId.status).toBe(400);
    });

    it("422 with structured details for invalid bodies", async () => {
      const cases: [object, string][] = [
        [{ ...validBody, title: "" }, "title"],
        [{ ...validBody, discountValue: 150 }, "discountValue"],
        [{ ...validBody, discountValue: 0 }, "discountValue"],
        [{ ...validBody, bundleType: "bogo" }, "bundleType"],
        [
          {
            ...validBody,
            products: [{ shopifyProductId: "x", shopifyVariantId: "1", quantity: 1 }],
          },
          "products[0].shopifyProductId",
        ],
      ];
      for (const [body, field] of cases) {
        const response = await call(createRoute, "POST", BASE, { body });
        const parsed = await json(response);
        expect(response.status).toBe(422);
        expect(parsed.error?.code).toBe("VALIDATION_ERROR");
        expect(parsed.error?.details?.map((d) => d.field)).toContain(field);
      }
    });

    it("refuses a client-supplied status so publish can't be bypassed", async () => {
      const response = await call(createRoute, "POST", BASE, {
        body: { ...validBody, status: "active" },
      });
      expect(response.status).toBe(422);
      expect(await prisma.bundle.count({ where: { title: "API Bundle", status: "active" } })).toBe(
        0,
      );
    });
  });

  describe("tenant isolation over HTTP", () => {
    it("returns 404 (never the data) for every operation on another shop's bundle", async () => {
      const victim = await createAs(cookieB, { ...validBody, title: "HTTP victim" });
      currentCookie = cookieA;
      const url = `${BASE}/${victim}`;

      const responses = await Promise.all([
        call(getRoute, "GET", url, { id: victim }),
        call(PATCH, "PATCH", url, { id: victim, body: { title: "Hijack" } }),
        call(PUT, "PUT", url, { id: victim, body: { title: "Hijack" } }),
        call(DELETE, "DELETE", url, { id: victim }),
        call(publishRoute, "POST", `${url}/publish`, { id: victim }),
        call(deactivateRoute, "POST", `${url}/deactivate`, { id: victim }),
        call(validateRoute, "POST", `${url}/validate`, { id: victim }),
        call(duplicateRoute, "POST", `${url}/duplicate`, { id: victim }),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(404);
        const body = await json(response);
        expect(body.error?.code).toBe("BUNDLE_NOT_FOUND");
        expect(JSON.stringify(body)).not.toContain("HTTP victim");
      }

      currentCookie = cookieB;
      const still = await json(await call(getRoute, "GET", url, { id: victim }));
      expect(still.data!.bundle).toMatchObject({ title: "HTTP victim", status: "draft" });
    });
  });

  describe("lifecycle over HTTP", () => {
    it("validate -> publish -> deactivate with the right status codes", async () => {
      const id = await createAs(cookieA, { ...validBody, title: "Lifecycle" });
      const url = `${BASE}/${id}`;

      const validation = await json(await call(validateRoute, "POST", `${url}/validate`, { id }));
      expect(validation.data).toEqual({ valid: true, errors: [] });

      const published = await call(publishRoute, "POST", `${url}/publish`, { id });
      expect(published.status).toBe(200);
      expect((await json(published)).data!.bundle.status).toBe("active");

      expect((await call(publishRoute, "POST", `${url}/publish`, { id })).status).toBe(409);
      expect((await call(PATCH, "PATCH", url, { id, body: { title: "x" } })).status).toBe(409);

      const deactivated = await call(deactivateRoute, "POST", `${url}/deactivate`, { id });
      expect((await json(deactivated)).data!.bundle.status).toBe("inactive");
      expect((await call(deactivateRoute, "POST", `${url}/deactivate`, { id })).status).toBe(409);
    });

    it("publish of an incomplete draft is 422 BUNDLE_CANNOT_BE_PUBLISHED with details", async () => {
      const id = await createAs(cookieA, { ...validBody, title: "Incomplete", products: [] });
      const response = await call(publishRoute, "POST", `${BASE}/${id}/publish`, { id });
      const body = await json(response);

      expect(response.status).toBe(422);
      expect(body.error?.code).toBe("BUNDLE_CANNOT_BE_PUBLISHED");
      expect(body.error?.details?.map((d) => d.field)).toContain("products");
    });

    it("PATCH updates, DELETE removes (then 404)", async () => {
      const id = await createAs(cookieA, { ...validBody, title: "To change" });
      const url = `${BASE}/${id}`;

      const patched = await json(
        await call(PATCH, "PATCH", url, { id, body: { title: "Changed" } }),
      );
      expect(patched.data!.bundle.title).toBe("Changed");

      expect((await call(DELETE, "DELETE", url, { id })).status).toBe(200);
      expect((await call(getRoute, "GET", url, { id })).status).toBe(404);
    });
  });

  describe("safe error responses", () => {
    it("never leaks internals on an unexpected failure", async () => {
      const spy = vi
        .spyOn(prisma.bundle, "findMany")
        .mockRejectedValueOnce(
          new Error("connection to db.internal.example:5432 refused; password=hunter2"),
        );
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const response = await call(listRoute, "GET", BASE);
      const body = await json(response);

      expect(response.status).toBe(500);
      expect(body.error?.code).toBe("INTERNAL_ERROR");
      expect(JSON.stringify(body)).not.toMatch(/hunter2|internal\.example|5432/);

      spy.mockRestore();
      consoleSpy.mockRestore();
    });
  });
});
