// @vitest-environment node
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CSRF_HEADER, CSRF_HEADER_VALUE } from "@/lib/api/csrf";
import { createSessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { fakeCatalog } from "@/services/products/test-instance";
import { seedCatalog } from "@/services/products/testing";
import { POST as createBundleRoute } from "../bundles/route";
import { PATCH as updateBundleRoute } from "../bundles/[id]/route";
import { GET as detailRoute } from "./[id]/route";
import { GET as listRoute } from "./route";
import { POST as syncRoute } from "./sync/route";

vi.mock("@/services/products/gateway", async () => {
  const { fakeCatalog } = await import("@/services/products/test-instance");
  return { openCatalogGateway: async () => fakeCatalog };
});
let currentCookie: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "bundlecraft_session" && currentCookie ? { name, value: currentCookie } : undefined,
  }),
}));

const canRun = Boolean(process.env.DATABASE_URL) && Boolean(process.env.SESSION_SECRET);
const DOMAIN_A = "bundlecraft-products-api-a.myshopify.com";
const DOMAIN_B = "bundlecraft-products-api-b.myshopify.com";
const LEAKS = /prisma|stack|node_modules|postgres|shpat_|at .*\(.*:\d+:\d+\)/i;

interface Envelope {
  success: boolean;
  data?: {
    items?: { id: string; title: string; shopifyProductId: string }[];
    total?: number;
    page?: number;
    limit?: number;
    catalog?: { status: string };
    product?: { id: string; title: string; variants: { shopifyVariantId: string }[] };
    outcome?: string;
    products?: number;
    bundle?: { id: string; products: unknown[] };
  };
  error?: { code: string; message: string; details?: { code: string; field: string }[] };
}
const json = async (response: Response) => (await response.json()) as Envelope;

const get = (route: (r: Request) => Promise<Response>, path: string) =>
  route(new Request(`http://localhost/api/products${path}`));
const detail = (id: string) =>
  detailRoute(new Request(`http://localhost/api/products/${id}`), {
    params: Promise.resolve({ id }),
  });
const post = (
  route: (r: Request) => Promise<Response>,
  path: string,
  body?: unknown,
  csrf = true,
) =>
  route(
    new Request(`http://localhost/api/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(csrf ? { [CSRF_HEADER]: CSRF_HEADER_VALUE } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );

describe.skipIf(!canRun)("product API (live database, fake Shopify)", () => {
  let shopA: string;
  let shopB: string;
  let cookieA: string;
  let cookieB: string;
  let aProduct: string;
  let bProduct: string;

  beforeAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    const make = async (shopDomain: string) =>
      (await prisma.shop.create({ data: { shopDomain, accessToken: "x", email: "p@example.com" } }))
        .id;
    shopA = await make(DOMAIN_A);
    shopB = await make(DOMAIN_B);
    const secret = process.env.SESSION_SECRET!;
    cookieA = await createSessionToken({ shopId: shopA, shopDomain: DOMAIN_A }, secret);
    cookieB = await createSessionToken({ shopId: shopB, shopDomain: DOMAIN_B }, secret);
    await seedCatalog(shopA, [
      { productId: "1", variantId: "11", title: "Alpha Tee" },
      { productId: "2", variantId: "21", title: "Beta Cap" },
    ]);
    await seedCatalog(shopB, [
      { productId: "77", variantId: "770", title: "Secret Shop B Product" },
    ]);
    aProduct = (
      await prisma.product.findFirstOrThrow({ where: { shopId: shopA, shopifyProductId: "1" } })
    ).id;
    bProduct = (await prisma.product.findFirstOrThrow({ where: { shopId: shopB } })).id;
  });
  afterAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    await prisma.$disconnect();
  });
  beforeEach(() => {
    vi.restoreAllMocks();
    fakeCatalog.reset();
    currentCookie = cookieA;
  });

  describe("authentication", () => {
    it("rejects every product endpoint with 401 for anonymous, garbage and tampered sessions", async () => {
      for (const cookie of [undefined, "garbage", `${cookieA}x`]) {
        currentCookie = cookie;
        const responses = [
          await get(listRoute, ""),
          await detail(aProduct),
          await post(syncRoute, "products/sync"),
        ];
        for (const response of responses) {
          expect(response.status).toBe(401);
          expect(JSON.stringify(await response.json())).not.toMatch(LEAKS);
        }
      }
      expect(fakeCatalog.calls).toEqual([]);
    });

    it("rejects a session of an inactive (uninstalled) shop", async () => {
      await prisma.shop.update({ where: { id: shopA }, data: { status: "inactive" } });
      try {
        expect((await get(listRoute, "")).status).toBe(401);
        expect((await post(syncRoute, "products/sync")).status).toBe(401);
      } finally {
        await prisma.shop.update({ where: { id: shopA }, data: { status: "active" } });
      }
    });

    it("sync requires the CSRF header (403), and starts nothing without it", async () => {
      expect((await post(syncRoute, "products/sync", undefined, false)).status).toBe(403);
      expect(fakeCatalog.calls).toEqual([]);
    });
  });

  describe("GET /api/products", () => {
    it("lists only the authenticated shop's products with pagination metadata", async () => {
      const { data } = await json(await get(listRoute, ""));
      expect(data?.items?.map((p) => p.title)).toEqual(["Alpha Tee", "Beta Cap"]);
      expect(data).toMatchObject({ total: 2, page: 1, limit: 20 });
      expect(data?.catalog).toBeDefined();
      expect(JSON.stringify(data)).not.toContain("Secret Shop B");

      currentCookie = cookieB;
      const other = await json(await get(listRoute, ""));
      expect(other.data?.items?.map((p) => p.title)).toEqual(["Secret Shop B Product"]);
    });

    it("paginates, searches and caps the page size", async () => {
      const page2 = await json(await get(listRoute, "?limit=1&page=2"));
      expect(page2.data?.items?.map((p) => p.title)).toEqual(["Beta Cap"]);
      expect((await json(await get(listRoute, "?search=alpha"))).data?.items).toHaveLength(1);
      expect((await get(listRoute, "?limit=51")).status).toBe(400);
    });

    it("cannot be pointed at another shop: shopId is refused, not silently ignored", async () => {
      const response = await get(listRoute, `?shopId=${shopB}`);
      expect(response.status).toBe(400);
      expect((await json(response)).error?.code).toBe("INVALID_REQUEST");
    });

    it("rejects hostile and malformed query values with 400 and no internals", async () => {
      for (const query of [
        "?page=0",
        "?page=abc",
        "?limit=-1",
        "?status=deleted",
        "?status=%27%20OR%201=1",
        "?unknown=1",
        `?search=${"x".repeat(200)}`,
      ]) {
        const response = await get(listRoute, query);
        expect(response.status, query).toBe(400);
        expect(JSON.stringify(await response.json())).not.toMatch(LEAKS);
      }
    });

    it("returns text-like filters as data (markup and SQL fragments just match nothing)", async () => {
      for (const search of ["<script>alert(1)</script>", "' OR 1=1 --", "%"]) {
        const response = await get(listRoute, `?search=${encodeURIComponent(search)}`);
        expect(response.status).toBe(200);
        expect((await json(response)).data?.items).toEqual([]);
      }
    });
  });

  describe("GET /api/products/:id", () => {
    it("returns the product with its variants", async () => {
      const { data } = await json(await detail(aProduct));
      expect(data?.product).toMatchObject({ title: "Alpha Tee" });
      expect(data?.product?.variants.map((v) => v.shopifyVariantId)).toEqual(["11"]);
      expect(JSON.stringify(data)).not.toMatch(/shopId|shop_id/);
    });

    it("another shop's product is a 404 that reveals nothing", async () => {
      const response = await detail(bProduct);
      expect(response.status).toBe(404);
      const body = await json(response);
      expect(body.error?.code).toBe("PRODUCT_NOT_FOUND");
      expect(JSON.stringify(body)).not.toContain("Secret Shop B");
      currentCookie = cookieB;
      expect((await detail(aProduct)).status).toBe(404);
    });

    it("rejects malformed and unknown ids", async () => {
      for (const id of ["1", "abc", "' OR 1=1 --", "%00", "gid://shopify/Product/1"]) {
        expect((await detail(id)).status, id).toBe(400);
      }
      expect((await detail(randomUUID())).status).toBe(404);
    });
  });

  describe("POST /api/products/sync", () => {
    it("syncs the authenticated shop's catalog from Shopify and reports the state", async () => {
      fakeCatalog.set({ id: 501, title: "Synced Tee", variants: [{ id: 5011 }, { id: 5012 }] });
      const response = await post(syncRoute, "products/sync");
      expect(response.status).toBe(200);
      const { data } = await json(response);
      expect(data).toMatchObject({ outcome: "synced", products: 1, catalog: { status: "synced" } });

      const listed = await json(await get(listRoute, "?search=synced"));
      expect(listed.data?.items?.[0]).toMatchObject({ title: "Synced Tee", variantCount: 2 });
      // Products of shop A only: shop B is untouched.
      expect(
        await prisma.product.count({ where: { shopId: shopB, shopifyProductId: "501" } }),
      ).toBe(0);
      expect(
        (await prisma.shop.findUniqueOrThrow({ where: { id: shopB } })).catalogSyncStatus,
      ).toBe("pending");
    });

    it("ignores any body: the shop is the session's, and there is nothing to choose", async () => {
      await post(syncRoute, "products/sync", { shopId: shopB, cursor: "x" });
      expect(
        (await prisma.shop.findUniqueOrThrow({ where: { id: shopB } })).catalogSyncStatus,
      ).toBe("pending");
    });

    it("turns a Shopify failure into a safe 502", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      fakeCatalog.failNext("fetchProductsPage", new Error("boom shpat_secret"));
      const response = await post(syncRoute, "products/sync");
      expect(response.status).toBe(502);
      const body = await json(response);
      expect(body.error?.code).toBe("SHOPIFY_API_ERROR");
      expect(JSON.stringify(body)).not.toMatch(/boom|shpat|prisma/i);
    });

    it("a second call while one is running says so instead of starting another", async () => {
      await prisma.shop.update({ where: { id: shopA }, data: { catalogSyncStatus: "syncing" } });
      const { data } = await json(await post(syncRoute, "products/sync"));
      expect(data?.outcome).toBe("already_running");
      expect(fakeCatalog.calls).toEqual([]);
      await prisma.shop.update({ where: { id: shopA }, data: { catalogSyncStatus: "pending" } });
    });
  });

  describe("bundle API uses the synced catalog", () => {
    const body = (products: object[]) => ({
      title: "API Bundle",
      bundleType: "fixed",
      discountType: "percentage",
      discountValue: 20,
      products,
    });
    const ref = (productId: string, variantId: string) => ({
      shopifyProductId: productId,
      shopifyVariantId: variantId,
      quantity: 1,
    });

    it("creates a bundle from this shop's synced products", async () => {
      const response = await post(createBundleRoute, "bundles", body([ref("1", "11")]));
      expect(response.status).toBe(201);
    });

    it("refuses another shop's product and made-up products with the same 422, and stores nothing", async () => {
      const before = await prisma.bundle.count({ where: { shopId: shopA } });
      const cross = await post(createBundleRoute, "bundles", body([ref("77", "770")]));
      const madeUp = await post(createBundleRoute, "bundles", body([ref("999", "9990")]));
      for (const response of [cross, madeUp]) {
        expect(response.status).toBe(422);
        const parsed = await json(response);
        expect(parsed.error?.details?.[0]).toMatchObject({
          code: "PRODUCT_NOT_FOUND",
          field: "products[0].shopifyVariantId",
        });
        expect(JSON.stringify(parsed)).not.toContain("Secret Shop B");
      }
      expect(await prisma.bundle.count({ where: { shopId: shopA } })).toBe(before);
    });

    it("refuses to switch an existing bundle to another shop's product", async () => {
      const created = await json(await post(createBundleRoute, "bundles", body([ref("1", "11")])));
      const id = created.data!.bundle!.id;
      const response = await updateBundleRoute(
        new Request(`http://localhost/api/bundles/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json", [CSRF_HEADER]: CSRF_HEADER_VALUE },
          body: JSON.stringify({ products: [ref("77", "770")] }),
        }),
        { params: Promise.resolve({ id }) },
      );
      expect(response.status).toBe(422);
    });
  });
});
