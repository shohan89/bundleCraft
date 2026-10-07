// @vitest-environment node
import { DEFAULT_CUSTOMIZATION } from "@/lib/customization/defaults";
import "dotenv/config";
import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { BundleDraftInput } from "@/lib/bundles/types";
import { prisma } from "@/lib/prisma";
import { createBundleSeeded as createBundle } from "@/services/products/testing";
import { deactivateBundle, publishBundle } from "@/services/bundles/publish";
import type { VariantInfo } from "@/services/storefront/product-info";
import { POST as cartRoute } from "./cart/route";
import { GET as bundlesRoute } from "./bundles/route";
import { POST as eventsRoute } from "./events/route";
import { grantPlan } from "@/services/billing/testing";

// Publishing syncs a Shopify discount (ACTION-007); that call is faked in memory.
vi.mock("@/services/discounts/gateway", async () => {
  const { fakeGateway } = await import("@/services/discounts/test-instance");
  return { openDiscountGateway: async () => fakeGateway };
});

// The only thing faked is the network call to Shopify: live product data.
const variantTable: Record<string, VariantInfo> = {
  "11": {
    variantId: "11",
    productTitle: "Tee",
    imageUrl: "https://cdn.shopify.com/tee.png",
    variants: [
      { id: "11", title: "S", price: "20.00", available: true },
      { id: "12", title: "M", price: "20.00", available: true },
      { id: "13", title: "L", price: "20.00", available: false },
    ],
  },
};
const lookup = vi.hoisted(() => ({ fail: false }));
vi.mock("@/services/storefront/product-info", () => ({
  getVariantInfo: async (_shop: unknown, ids: string[]) => {
    const map = new Map<string, VariantInfo>();
    if (lookup.fail) return map;
    for (const id of ids) {
      map.set(
        id,
        variantTable[id] ?? {
          variantId: id,
          productTitle: `Product ${id}`,
          imageUrl: null,
          variants: [{ id, title: "Default", price: "10.00", available: true }],
        },
      );
    }
    return map;
  },
}));

const canRun =
  Boolean(process.env.DATABASE_URL) &&
  Boolean(process.env.SHOPIFY_API_SECRET) &&
  Boolean(process.env.SESSION_SECRET);
const SECRET = process.env.SHOPIFY_API_SECRET ?? "";
const DOMAIN_A = "bundlecraft-sf-test-a.myshopify.com";
const DOMAIN_B = "bundlecraft-sf-test-b.myshopify.com";
const BASE = "http://localhost/api/storefront";

interface Body {
  success: boolean;
  data?: {
    bundles: Record<string, unknown>[];
    items: { id: number; quantity: number; properties: Record<string, string> }[];
    accepted?: boolean;
    recorded?: boolean;
  };
  error?: { code: string; message: string; details?: unknown };
}

function signedUrl(
  path: string,
  extra: Record<string, string> = {},
  options: { shop?: string; secret?: string; timestamp?: number } = {},
): string {
  const pairs: [string, string][] = [
    ["shop", options.shop ?? DOMAIN_A],
    ["path_prefix", "/apps/bundlecraft"],
    ["timestamp", String(options.timestamp ?? Math.floor(Date.now() / 1000))],
    ...Object.entries(extra),
  ];
  const message = [...pairs]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("");
  const signature = createHmac("sha256", options.secret ?? SECRET)
    .update(message)
    .digest("hex");
  return `${BASE}${path}?${new URLSearchParams([...pairs, ["signature", signature]])}`;
}

const get = async (url: string) => {
  const response = await bundlesRoute(new Request(url));
  return { response, body: (await response.json()) as Body };
};
const post = async (handler: (r: Request) => Promise<Response>, url: string, body: unknown) => {
  const response = await handler(new Request(url, { method: "POST", body: JSON.stringify(body) }));
  return { response, body: (await response.json()) as Body };
};

function input(over: Partial<BundleDraftInput>): BundleDraftInput {
  return {
    title: "Bundle",
    description: null,
    bundleType: "fixed",
    templateId: null,
    requiredQuantity: null,
    discountType: "percentage",
    discountValue: 20,
    products: [
      { shopifyProductId: "1001", shopifyVariantId: "11", quantity: 1 },
      { shopifyProductId: "1002", shopifyVariantId: "21", quantity: 1 },
    ],
    customization: null,
    ...over,
  };
}

describe.skipIf(!canRun)("storefront API (live database, signed requests)", () => {
  let shopA: string;
  let shopB: string;
  const id: Record<string, string> = {};

  beforeAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    shopA = (
      await prisma.shop.create({
        data: { shopDomain: DOMAIN_A, accessToken: "x", email: "a@example.com" },
      })
    ).id;
    await grantPlan(shopA, "growth");
    shopB = (
      await prisma.shop.create({
        data: { shopDomain: DOMAIN_B, accessToken: "x", email: "b@example.com" },
      })
    ).id;
    await grantPlan(shopB, "growth");

    const make = async (
      shop: string,
      key: string,
      over: Partial<BundleDraftInput>,
      live: boolean,
    ) => {
      const bundle = await createBundle(shop, input({ title: key, ...over }));
      if (live) await publishBundle(shop, bundle.id);
      id[key] = bundle.id;
    };
    await make(
      shopA,
      "Fixed",
      {
        customization: {
          layout: "horizontal",
          colors: {
            primary: "#112233",
            button: "#445566",
            background: "#ffeecc",
            accent: "#778899",
            text: "#223344",
          },
          typography: {
            fontFamily: "serif",
            fontSize: 20,
            titleSize: "large",
            descriptionSize: "small",
          },
          card: { borderRadius: "large", shadow: "strong" },
          button: { style: "outline", size: "large" },
          spacing: { density: "compact" },
        },
      },
      true,
    );
    await make(
      shopA,
      "Quantity",
      {
        bundleType: "quantity",
        requiredQuantity: 3,
        discountType: "fixed_amount",
        discountValue: 5,
        products: [
          { shopifyProductId: "3001", shopifyVariantId: "31", quantity: 1 },
          { shopifyProductId: "3002", shopifyVariantId: "41", quantity: 1 },
        ],
      },
      true,
    );
    await make(
      shopA,
      "Mix",
      {
        bundleType: "mix_match",
        requiredQuantity: 2,
        products: [
          { shopifyProductId: "5001", shopifyVariantId: "51", quantity: 1 },
          { shopifyProductId: "5002", shopifyVariantId: "61", quantity: 1 },
          { shopifyProductId: "5003", shopifyVariantId: "71", quantity: 1 },
        ],
      },
      true,
    );
    await make(shopA, "Draft", {}, false);
    await make(shopA, "Inactive", {}, true);
    await deactivateBundle(shopA, id.Inactive);
    await make(shopB, "B-secret", {}, true);
  });

  afterAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    await prisma.$disconnect();
  });

  describe("request verification", () => {
    it("rejects unsigned, wrongly signed, stale, and tampered requests with 401", async () => {
      expect((await get(`${BASE}/bundles?shop=${DOMAIN_A}`)).response.status).toBe(401);
      expect((await get(signedUrl("/bundles", {}, { secret: "wrong" }))).response.status).toBe(401);
      expect(
        (await get(signedUrl("/bundles", {}, { timestamp: Math.floor(Date.now() / 1000) - 3600 })))
          .response.status,
      ).toBe(401);

      // Signed for shop A, then the shop param swapped to B: the classic cross-tenant attempt.
      const forged = signedUrl("/bundles").replace(DOMAIN_A, DOMAIN_B);
      const { response, body } = await get(forged);
      expect(response.status).toBe(401);
      expect(JSON.stringify(body)).not.toContain("B-secret");
    });

    it("treats an unknown or uninstalled shop like a shop with nothing to show (404)", async () => {
      expect(
        (await get(signedUrl("/bundles", {}, { shop: "no-such-shop.myshopify.com" }))).response
          .status,
      ).toBe(404);

      await prisma.shop.update({ where: { id: shopB }, data: { status: "inactive" } });
      expect((await get(signedUrl("/bundles", {}, { shop: DOMAIN_B }))).response.status).toBe(404);
      await prisma.shop.update({ where: { id: shopB }, data: { status: "active" } });
    });

    it("rejects a malformed shop domain", async () => {
      expect((await get(signedUrl("/bundles", {}, { shop: "evil.com" }))).response.status).toBe(
        400,
      );
    });
  });

  describe("bundle visibility", () => {
    it("lists only ACTIVE bundles of the calling shop", async () => {
      const { response, body } = await get(signedUrl("/bundles"));
      const names = (body.data?.bundles ?? []).map((b) => b.name);

      expect(response.status).toBe(200);
      expect(names).toEqual(expect.arrayContaining(["Fixed", "Quantity", "Mix"]));
      expect(names).not.toContain("Draft"); // draft hidden
      expect(names).not.toContain("Inactive"); // inactive hidden
      expect(names).not.toContain("B-secret"); // another shop's bundle hidden
    });

    it("404s a specific bundle that is draft, inactive, or another shop's", async () => {
      for (const key of ["Draft", "Inactive", "B-secret"]) {
        const { response, body } = await get(signedUrl("/bundles", { bundleId: id[key] }));
        expect(response.status).toBe(404);
        expect(body.error?.code).toBe("BUNDLE_NOT_FOUND");
        expect(body.error?.message).toBe("This bundle is currently unavailable.");
      }
    });

    it("404s a bundle id that doesn't exist and 400s a malformed one", async () => {
      expect(
        (await get(signedUrl("/bundles", { bundleId: "5f0c6a6e-8f0e-4c53-9b64-6f7f3f2b9a11" })))
          .response.status,
      ).toBe(404);
      expect((await get(signedUrl("/bundles", { bundleId: "not-a-uuid" }))).response.status).toBe(
        400,
      );
      expect((await get(signedUrl("/bundles", { productId: "12abc" }))).response.status).toBe(400);
    });

    it("a bundle vanishes from the storefront as soon as it's deactivated, and returns when re-published", async () => {
      const bundle = await createBundle(shopA, input({ title: "Toggle" }));
      await publishBundle(shopA, bundle.id);
      expect((await get(signedUrl("/bundles", { bundleId: bundle.id }))).response.status).toBe(200);

      await deactivateBundle(shopA, bundle.id);
      expect((await get(signedUrl("/bundles", { bundleId: bundle.id }))).response.status).toBe(404);

      await publishBundle(shopA, bundle.id);
      expect((await get(signedUrl("/bundles", { bundleId: bundle.id }))).response.status).toBe(200);
    });

    it("filters by product for the product page widget", async () => {
      const { body } = await get(signedUrl("/bundles", { productId: "3001" }));
      expect((body.data?.bundles ?? []).map((b) => b.name)).toEqual(["Quantity"]);
      expect(
        (await get(signedUrl("/bundles", { productId: "999999" }))).body.data?.bundles,
      ).toEqual([]);
    });
  });

  describe("public data protection", () => {
    it("exposes exactly the storefront-safe fields and nothing merchant-private", async () => {
      const { response, body } = await get(signedUrl("/bundles", { bundleId: id.Fixed }));
      const bundle = body.data!.bundles[0];

      expect(Object.keys(bundle).sort()).toEqual(
        [
          "customization",
          "description",
          "discount",
          "id",
          "name",
          "productCount",
          "products",
          "requiredQuantity",
          "type",
        ].sort(),
      );
      const text = JSON.stringify(body);
      for (const forbidden of [
        "shopId",
        "shop_id",
        "accessToken",
        "access_token",
        "status",
        "templateId",
        "createdAt",
        "updatedAt",
        "email",
        "plan",
        "revenue",
        "shpat_",
        "shpss_",
      ]) {
        expect(text).not.toContain(forbidden);
      }
      expect(response.headers.get("cache-control")).toContain("max-age=30");
    });

    it("includes live product info, variants and the configured customization for a single bundle", async () => {
      const { body } = await get(signedUrl("/bundles", { bundleId: id.Fixed }));
      const bundle = body.data!.bundles[0] as {
        customization: unknown;
        products: { title: string | null; imageUrl: string | null; variants: unknown[] }[];
      };

      expect(bundle.customization).toEqual({
        layout: "horizontal",
        colors: {
          primary: "#112233",
          button: "#445566",
          background: "#ffeecc",
          accent: "#778899",
          text: "#223344",
        },
        typography: {
          fontFamily: "serif",
          fontSize: 20,
          titleSize: "large",
          descriptionSize: "small",
        },
        card: { borderRadius: "large", shadow: "strong" },
        button: { style: "outline", size: "large" },
        spacing: { density: "compact" },
      });
      expect(bundle.products[0]).toMatchObject({
        title: "Tee",
        imageUrl: "https://cdn.shopify.com/tee.png",
      });
      expect(bundle.products[0].variants).toHaveLength(3);
    });

    it("skips live product lookups for the listing (cheap) and still returns usable data", async () => {
      const { body } = await get(signedUrl("/bundles"));
      const fixed = (body.data?.bundles ?? []).find((b) => b.name === "Fixed") as {
        products: { title: string | null }[];
        productCount: number;
      };
      expect(fixed.products[0].title).toBeNull();
      expect(fixed.productCount).toBe(2);
    });

    it("falls back to safe default customization when none is stored, and rejects unsafe stored values", async () => {
      const { body } = await get(signedUrl("/bundles", { bundleId: id.Quantity }));
      expect((body.data!.bundles[0] as { customization: unknown }).customization).toEqual(
        DEFAULT_CUSTOMIZATION,
      );

      await prisma.customization.create({
        data: {
          bundleId: id.Quantity,
          primaryColor: "url(javascript:alert(1))",
          buttonColor: "#123456",
          backgroundColor: "#ffffff",
          layout: "card",
          fontSize: 16,
        },
      });
      const after = await get(signedUrl("/bundles", { bundleId: id.Quantity }));
      const customization = (
        after.body.data!.bundles[0] as {
          customization: { colors: { primary: string; button: string } };
        }
      ).customization;
      expect(customization.colors.primary).toBe("#111827");
      expect(customization.colors.button).toBe("#123456");
    });

    it("degrades gracefully when Shopify product data can't be retrieved", async () => {
      lookup.fail = true;
      try {
        const { response, body } = await get(signedUrl("/bundles", { bundleId: id.Fixed }));
        const product = (
          body.data!.bundles[0] as { products: { title: string | null; variants: unknown[] }[] }
        ).products[0];
        expect(response.status).toBe(200);
        expect(product.title).toBeNull();
        expect(product.variants).toEqual([]);
      } finally {
        lookup.fail = false;
      }
    });
  });

  describe("add bundle to cart (authoritative validation)", () => {
    const cart = (
      bundleId: string,
      selection: unknown[],
      over: Parameters<typeof signedUrl>[2] = {},
    ) => post(cartRoute, signedUrl("/cart", {}, over), { bundleId, selection });

    it("fixed bundle: builds a line per product with the chosen variant and hidden bundle properties", async () => {
      const { response, body } = await cart(id.Fixed, [
        { key: "11", variantId: "12", quantity: 1 },
        { key: "21", variantId: "21", quantity: 1 },
      ]);

      expect(response.status).toBe(200);
      expect(body.data!.items.map((i) => [i.id, i.quantity])).toEqual([
        [12, 1],
        [21, 1],
      ]); // variant 12, not the configured 11
      expect(body.data!.items[0].properties).toMatchObject({
        _bundle_id: id.Fixed,
        _bundle_name: "Fixed",
        _bundle_type: "fixed",
      });
      expect(new Set(body.data!.items.map((i) => i.properties._bundle_instance_id)).size).toBe(1);
      expect(response.headers.get("cache-control")).toBe("no-store");
    });

    it("rejects an invalid bundle (draft, inactive, another shop's, unknown) without building anything", async () => {
      for (const key of ["Draft", "Inactive", "B-secret"]) {
        const { response, body } = await cart(id[key], [
          { key: "11", variantId: "11", quantity: 1 },
        ]);
        expect(response.status).toBe(404);
        expect(body.data).toBeUndefined();
      }
      expect((await cart("5f0c6a6e-8f0e-4c53-9b64-6f7f3f2b9a11", [])).response.status).toBe(404);
    });

    it("rejects an incomplete fixed selection and variants that are sold out or not part of the product", async () => {
      expect(
        (await cart(id.Fixed, [{ key: "11", variantId: "11", quantity: 1 }])).response.status,
      ).toBe(422);
      const soldOut = await cart(id.Fixed, [
        { key: "11", variantId: "13", quantity: 1 },
        { key: "21", variantId: "21", quantity: 1 },
      ]);
      expect(soldOut.response.status).toBe(422);
      const foreign = await cart(id.Fixed, [
        { key: "11", variantId: "999", quantity: 1 },
        { key: "21", variantId: "21", quantity: 1 },
      ]);
      expect(foreign.response.status).toBe(422);
    });

    it("quantity bundle: accepts the required count, blocks under- and over-selection", async () => {
      const ok = await cart(id.Quantity, [
        { key: "31", variantId: "31", quantity: 2 },
        { key: "41", variantId: "41", quantity: 1 },
      ]);
      expect(ok.response.status).toBe(200);
      expect(ok.body.data!.items.reduce((sum, i) => sum + i.quantity, 0)).toBe(3);

      const under = await cart(id.Quantity, [{ key: "31", variantId: "31", quantity: 1 }]);
      expect(under.response.status).toBe(422);
      expect(under.body.error?.message).toBe("Choose 2 more items.");

      expect(
        (await cart(id.Quantity, [{ key: "31", variantId: "31", quantity: 4 }])).response.status,
      ).toBe(422);
    });

    it("mix & match: enforces the required count, distinct products, and known products", async () => {
      const ok = await cart(id.Mix, [
        { key: "51", variantId: "51", quantity: 1 },
        { key: "71", variantId: "71", quantity: 1 },
      ]);
      expect(ok.response.status).toBe(200);

      expect(
        (await cart(id.Mix, [{ key: "51", variantId: "51", quantity: 1 }])).response.status,
      ).toBe(422);
      expect(
        (
          await cart(id.Mix, [
            { key: "51", variantId: "51", quantity: 1 },
            { key: "51", variantId: "51", quantity: 1 },
          ])
        ).response.status,
      ).toBe(422);
      expect(
        (
          await cart(id.Mix, [
            { key: "51", variantId: "51", quantity: 1 },
            { key: "999", variantId: "999", quantity: 1 },
          ])
        ).response.status,
      ).toBe(422);
    });

    it("rejects malformed or over-reaching bodies and unsigned requests", async () => {
      expect(
        (await post(cartRoute, signedUrl("/cart"), { bundleId: "nope", selection: [] })).response
          .status,
      ).toBe(400);
      expect(
        (
          await post(cartRoute, signedUrl("/cart"), {
            bundleId: id.Fixed,
            selection: [],
            shopId: shopB,
          })
        ).response.status,
      ).toBe(400);
      expect((await cart(id.Fixed, [], { secret: "wrong" })).response.status).toBe(401);
    });

    it("never leaks internal detail in errors", async () => {
      const { body } = await cart(id.Fixed, [
        { key: "11", variantId: "999", quantity: 1 },
        { key: "21", variantId: "21", quantity: 1 },
      ]);
      expect(JSON.stringify(body)).not.toMatch(/prisma|stack|select |shopId|token/i);
    });
  });

  describe("analytics events", () => {
    const uuid = () => randomUUID();
    const send = (
      bundleId: string,
      event: unknown,
      extra: Record<string, unknown> = {},
      over: Parameters<typeof signedUrl>[2] = {},
    ) =>
      post(eventsRoute, signedUrl("/events", {}, over), {
        bundleId,
        event,
        eventId: uuid(),
        ...extra,
      });
    const rows = (bundleId: string) =>
      prisma.analyticsEvent.findMany({ where: { bundleId }, orderBy: { createdAt: "asc" } });

    it("stores bundle_view and bundle_add for an active bundle, scoped to the signed shop (202)", async () => {
      const instanceId = uuid();
      const view = await send(id.Fixed, "bundle_view");
      const add = await send(id.Fixed, "bundle_add", { instanceId });
      expect(view.response.status).toBe(202);
      expect(view.body.data).toEqual({ accepted: true, recorded: true });
      expect(add.body.data).toEqual({ accepted: true, recorded: true });

      const stored = await rows(id.Fixed);
      expect(stored.map((row) => row.eventType)).toEqual(["bundle_view", "bundle_add"]);
      expect(stored.every((row) => row.shopId === shopA)).toBe(true);
      expect(stored.every((row) => row.revenue === null && row.currency === null)).toBe(true);
      expect(stored[1].metadataJson).toEqual({
        source: "storefront",
        bundleType: "fixed",
        instanceId,
      });
    });

    it("stores nothing about the shopper", async () => {
      await send(id.Fixed, "bundle_view");
      const [row] = (await rows(id.Fixed)).slice(-1);
      expect(Object.keys(row.metadataJson as object).sort()).toEqual(["bundleType", "source"]);
    });

    it("is idempotent: a retried event, or the same cart instance reported twice, is one row", async () => {
      const bundleId = id.Quantity;
      const eventId = uuid();
      const payload = { bundleId, event: "bundle_view", eventId };
      const first = await post(eventsRoute, signedUrl("/events"), payload);
      const retry = await post(eventsRoute, signedUrl("/events"), payload);
      expect(first.body.data?.recorded).toBe(true);
      expect(retry.response.status).toBe(202);
      expect(retry.body.data).toEqual({ accepted: true, recorded: false });

      const instanceId = uuid();
      await send(bundleId, "bundle_add", { instanceId });
      const again = await send(bundleId, "bundle_add", { instanceId });
      expect(again.body.data?.recorded).toBe(false);

      const stored = await rows(bundleId);
      expect(stored.filter((row) => row.eventType === "bundle_view")).toHaveLength(1);
      expect(stored.filter((row) => row.eventType === "bundle_add")).toHaveLength(1);
    });

    it("rejects invalid events: purchases from a browser, missing/odd ids, client-supplied shop or revenue", async () => {
      const before = (await rows(id.Fixed)).length;
      expect((await send(id.Fixed, "bundle_purchase")).response.status).toBe(400);
      expect((await send(id.Fixed, "nonsense")).response.status).toBe(400);
      expect((await send(id.Fixed, "bundle_view", { eventId: "not-a-uuid" })).response.status).toBe(
        400,
      );
      expect((await send(id.Fixed, "bundle_add", { instanceId: "x" })).response.status).toBe(400);
      expect((await send(id.Fixed, "bundle_view", { shopId: shopB })).response.status).toBe(400);
      expect((await send(id.Fixed, "bundle_add", { revenue: 999 })).response.status).toBe(400);
      expect(
        (
          await post(eventsRoute, signedUrl("/events"), {
            bundleId: id.Fixed,
            event: "bundle_view",
          })
        ).response.status,
      ).toBe(400);
      expect((await rows(id.Fixed)).length).toBe(before);
    });

    it("refuses drafts, other shops' bundles and unsigned requests, and writes nothing", async () => {
      expect((await send(id.Draft, "bundle_view")).response.status).toBe(404);
      expect((await send(id["B-secret"], "bundle_view")).response.status).toBe(404);
      expect((await send(id.Fixed, "bundle_view", {}, { secret: "wrong" })).response.status).toBe(
        401,
      );
      expect(await rows(id.Draft)).toHaveLength(0);
      expect(await rows(id["B-secret"])).toHaveLength(0);
    });

    it("a signed request for shop B can only touch shop B's bundles", async () => {
      const { response } = await send(id.Fixed, "bundle_view", {}, { shop: DOMAIN_B });
      expect(response.status).toBe(404);
    });
  });
});
