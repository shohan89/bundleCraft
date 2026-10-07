// @vitest-environment node
import { DEFAULT_CUSTOMIZATION } from "@/lib/customization/defaults";
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CSRF_HEADER, CSRF_HEADER_VALUE } from "@/lib/api/csrf";
import { createSessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { POST as createRoute } from "./route";
import { GET as getRoute, PATCH } from "./[id]/route";
import { POST as publishRoute } from "./[id]/publish/route";
import { seedCatalog } from "@/services/products/testing";

let currentCookie: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "bundlecraft_session" && currentCookie ? { name, value: currentCookie } : undefined,
  }),
}));

const canRun = Boolean(process.env.DATABASE_URL) && Boolean(process.env.SESSION_SECRET);
const DOMAIN = "bundlecraft-input-test.myshopify.com";
const LEAKS = /prisma|stack|node_modules|postgres|shpat_|at .*\(.*:\d+:\d+\)/i;

const valid = {
  title: "Input Bundle",
  bundleType: "fixed",
  discountType: "percentage",
  discountValue: 20,
  products: [{ shopifyProductId: "1001", shopifyVariantId: "2001", quantity: 1 }],
};

const send = (
  handler: (r: Request, c: { params: Promise<{ id: string }> }) => Promise<Response>,
  method: string,
  body: unknown,
  id = "",
  raw?: string,
) =>
  handler(
    new Request("http://localhost/api/bundles", {
      method,
      headers: { "content-type": "application/json", [CSRF_HEADER]: CSRF_HEADER_VALUE },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    }),
    { params: Promise.resolve({ id }) },
  );

interface Envelope {
  success: boolean;
  data?: { bundle: { id: string; title: string; description: string | null } };
  error?: { code: string; message: string };
}

describe.skipIf(!canRun)("bundle API rejects hostile and malformed input", () => {
  let shopId: string;

  beforeAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: DOMAIN } });
    shopId = (
      await prisma.shop.create({
        data: { shopDomain: DOMAIN, accessToken: "x", email: "i@example.com" },
      })
    ).id;
    await seedCatalog(shopId, [{ productId: "1001", variantId: "2001" }]);
    currentCookie = await createSessionToken(
      { shopId, shopDomain: DOMAIN },
      process.env.SESSION_SECRET!,
    );
  });
  afterAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: DOMAIN } });
    await prisma.$disconnect();
  });

  const count = () => prisma.bundle.count({ where: { shopId } });

  const rejected: [string, unknown][] = [
    ["non-object bodies", []],
    ["a string body", "bundle"],
    ["a number body", 5],
    ["a null body", null],
    ["a client-set status", { ...valid, status: "active" }],
    ["a client-set shop id", { ...valid, shopId: "another-shop" }],
    ["an unknown field", { ...valid, isAdmin: true }],
    ["a missing title", { ...valid, title: undefined }],
    ["an empty title", { ...valid, title: "   " }],
    ["a 10,000 character title", { ...valid, title: "x".repeat(10_000) }],
    ["a numeric title", { ...valid, title: 42 }],
    ["an invalid bundle type", { ...valid, bundleType: "evil" }],
    ["an invalid discount type", { ...valid, discountType: "free" }],
    ["a string discount value", { ...valid, discountValue: "20" }],
    ["a zero discount", { ...valid, discountValue: 0 }],
    ["a negative discount", { ...valid, discountValue: -5 }],
    ["a percentage over 100", { ...valid, discountValue: 101 }],
    [
      "an astronomically large fixed discount",
      { ...valid, discountType: "fixed_amount", discountValue: 1e21 },
    ],
    ["a three-decimal discount", { ...valid, discountValue: 10.123 }],
    ["a non-uuid template id", { ...valid, templateId: "not-a-uuid" }],
    ["an unknown template id", { ...valid, templateId: "5f0c6a6e-8f0e-4c53-9b64-6f7f3f2b9a99" }],
    ["a negative required quantity", { ...valid, bundleType: "quantity", requiredQuantity: -1 }],
    ["an enormous required quantity", { ...valid, bundleType: "mix_match", requiredQuantity: 1e9 }],
    ["a fractional required quantity", { ...valid, bundleType: "quantity", requiredQuantity: 2.5 }],
    ["zero product quantity", { ...valid, products: [{ ...valid.products[0], quantity: 0 }] }],
    ["negative product quantity", { ...valid, products: [{ ...valid.products[0], quantity: -3 }] }],
    ["huge product quantity", { ...valid, products: [{ ...valid.products[0], quantity: 1e9 }] }],
    [
      "fractional product quantity",
      { ...valid, products: [{ ...valid.products[0], quantity: 1.5 }] },
    ],
    [
      "a malformed product id",
      { ...valid, products: [{ ...valid.products[0], shopifyProductId: "abc" }] },
    ],
    [
      "a foreign gid product id",
      { ...valid, products: [{ ...valid.products[0], shopifyProductId: "gid://evil/Product/1" }] },
    ],
    [
      "an injection-shaped variant id",
      {
        ...valid,
        products: [{ ...valid.products[0], shopifyVariantId: "1; DROP TABLE bundles;--" }],
      },
    ],
    ["duplicate variants", { ...valid, products: [valid.products[0], valid.products[0]] }],
    [
      "more than 50 products",
      {
        ...valid,
        products: Array.from({ length: 51 }, (_, i) => ({
          shopifyProductId: String(i + 1),
          shopifyVariantId: String(i + 1000),
          quantity: 1,
        })),
      },
    ],
    ["an unknown product field", { ...valid, products: [{ ...valid.products[0], price: 0 }] }],
    [
      "a bad customization color",
      {
        ...valid,
        customization: {
          layout: "card",
          colors: {
            ...DEFAULT_CUSTOMIZATION.colors,
            primary: "red",
            button: "#000000",
            background: "#ffffff",
          },
          typography: { ...DEFAULT_CUSTOMIZATION.typography, fontSize: 16 },
          card: DEFAULT_CUSTOMIZATION.card,
          button: DEFAULT_CUSTOMIZATION.button,
          spacing: DEFAULT_CUSTOMIZATION.spacing,
        },
      },
    ],
    [
      "a script-injection color",
      {
        ...valid,
        customization: {
          layout: "card",
          colors: {
            ...DEFAULT_CUSTOMIZATION.colors,
            primary: "#000000;}</style><script>alert(1)</script>",
            button: "#000000",
            background: "#ffffff",
          },
          typography: { ...DEFAULT_CUSTOMIZATION.typography, fontSize: 16 },
          card: DEFAULT_CUSTOMIZATION.card,
          button: DEFAULT_CUSTOMIZATION.button,
          spacing: DEFAULT_CUSTOMIZATION.spacing,
        },
      },
    ],
    [
      "an unknown layout",
      {
        ...valid,
        customization: {
          layout: "carousel",
          colors: {
            ...DEFAULT_CUSTOMIZATION.colors,
            primary: "#000000",
            button: "#000000",
            background: "#ffffff",
          },
          typography: { ...DEFAULT_CUSTOMIZATION.typography, fontSize: 16 },
          card: DEFAULT_CUSTOMIZATION.card,
          button: DEFAULT_CUSTOMIZATION.button,
          spacing: DEFAULT_CUSTOMIZATION.spacing,
        },
      },
    ],
    [
      "an absurd font size",
      {
        ...valid,
        customization: {
          layout: "card",
          colors: {
            ...DEFAULT_CUSTOMIZATION.colors,
            primary: "#000000",
            button: "#000000",
            background: "#ffffff",
          },
          typography: { ...DEFAULT_CUSTOMIZATION.typography, fontSize: 9000 },
          card: DEFAULT_CUSTOMIZATION.card,
          button: DEFAULT_CUSTOMIZATION.button,
          spacing: DEFAULT_CUSTOMIZATION.spacing,
        },
      },
    ],
  ];

  it.each(rejected)(
    "create rejects %s with 4xx, a safe message, and stores nothing",
    async (_name, body) => {
      const before = await count();
      const response = await send(createRoute, "POST", body);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      const text = await response.text();
      expect(text).not.toMatch(LEAKS);
      expect((JSON.parse(text) as Envelope).success).toBe(false);
      expect(await count()).toBe(before);
    },
  );

  it("rejects non-JSON bodies with 400 and oversized bodies with 413", async () => {
    expect((await send(createRoute, "POST", undefined, "", "{not json")).status).toBe(400);
    expect((await send(createRoute, "POST", undefined, "", "")).status).toBe(400);
    const big = await send(createRoute, "POST", { ...valid, description: "x".repeat(300_000) });
    expect(big.status).toBe(413);
    expect((await big.json()).error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("stores markup and SQL-shaped text verbatim as inert data (output is escaped at render time)", async () => {
    const title = `<img src=x onerror=alert(1)>'; DROP TABLE bundles;-- "`;
    const created = await send(createRoute, "POST", {
      ...valid,
      title,
      description: "<script>alert(1)</script>",
    });
    expect(created.status).toBe(201);
    const { data } = (await created.json()) as Envelope;
    expect(data?.bundle.title).toBe(title);

    const fetched = await send(getRoute, "GET", undefined, data!.bundle.id);
    expect(((await fetched.json()) as Envelope).data?.bundle.title).toBe(title);
    expect(await prisma.bundle.count({ where: { shopId } })).toBeGreaterThan(0); // table intact
  });

  it("update rejects status changes and hostile fields the same way", async () => {
    const created = (await (await send(createRoute, "POST", valid)).json()) as Envelope;
    const id = created.data!.bundle.id;
    for (const body of [
      { status: "active" },
      { shopId: "x" },
      { discountValue: -1 },
      { bundleType: "nope" },
      { products: [{ shopifyProductId: "1", shopifyVariantId: "2", quantity: 0 }] },
    ]) {
      const response = await send(PATCH, "PATCH", body, id);
      expect(response.status, JSON.stringify(body)).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    }
    const after = (await (await send(getRoute, "GET", undefined, id)).json()) as Envelope;
    expect(after.data?.bundle).toMatchObject({ title: "Input Bundle" });
    expect(await prisma.bundle.count({ where: { id, status: "draft" } })).toBe(1);
  });

  it("an incomplete draft is accepted, but the server refuses to publish it (422), whatever the client claims", async () => {
    const created = await send(createRoute, "POST", { ...valid, bundleType: "quantity" });
    expect(created.status).toBe(201);
    const id = ((await created.json()) as Envelope).data!.bundle.id;

    const published = await send(publishRoute, "POST", {}, id);
    expect(published.status).toBe(422);
    expect(((await published.json()) as Envelope).error?.code).toBe("BUNDLE_CANNOT_BE_PUBLISHED");
    expect(await prisma.bundle.count({ where: { id, status: "draft" } })).toBe(1);
  });
});
