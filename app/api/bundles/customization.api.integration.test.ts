// @vitest-environment node
import "dotenv/config";
import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CSRF_HEADER, CSRF_HEADER_VALUE } from "@/lib/api/csrf";
import { createSessionToken } from "@/lib/auth/session";
import type { BundleDraftInput } from "@/lib/bundles/types";
import { DEFAULT_CUSTOMIZATION } from "@/lib/customization/defaults";
import type { BundleCustomization } from "@/lib/customization/types";
import { prisma } from "@/lib/prisma";
import { createBundleSeeded } from "@/services/products/testing";
import { getTemplateBySlug } from "@/services/templates/templates";
import { GET as storefrontRoute } from "../storefront/bundles/route";
import { POST as createBundleRoute } from "./route";
import { GET as getBundleRoute } from "./[id]/route";
import * as customizationRoute from "./[id]/customization/route";

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
const DOMAIN_A = "bundlecraft-custom-a.myshopify.com";
const DOMAIN_B = "bundlecraft-custom-b.myshopify.com";
const LEAKS = /prisma|stack|node_modules|postgres|shpat_|at .*\(.*:\d+:\d+\)/i;

interface Envelope {
  success: boolean;
  data?: {
    customization?: BundleCustomization;
    bundle?: { id: string; customization: BundleCustomization | null; templateId: string | null };
    bundles?: { customization: BundleCustomization; [key: string]: unknown }[];
  };
  error?: {
    code: string;
    message: string;
    details?: { field: string; code: string; message: string }[];
  };
}
const json = async (response: Response) => (await response.json()) as Envelope;

const custom: BundleCustomization = {
  layout: "vertical",
  colors: {
    primary: "#112233",
    button: "#445566",
    background: "#ffeecc",
    accent: "#778899",
    text: "#223344",
  },
  typography: { fontFamily: "serif", fontSize: 20, titleSize: "large", descriptionSize: "small" },
  card: { borderRadius: "large", shadow: "strong" },
  button: { style: "outline", size: "large" },
  spacing: { density: "compact" },
};

const input = (title: string): BundleDraftInput => ({
  title,
  description: null,
  bundleType: "fixed",
  templateId: null,
  requiredQuantity: null,
  discountType: "percentage",
  discountValue: 10,
  products: [{ shopifyProductId: "7001", shopifyVariantId: "70011", quantity: 1 }],
  customization: null,
});

function call(
  method: "GET" | "PATCH" | "PUT",
  id: string,
  body?: unknown,
  { csrf = true, raw }: { csrf?: boolean; raw?: string } = {},
) {
  const handler = customizationRoute[method];
  return handler(
    new Request(`http://localhost/api/bundles/${id}/customization`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(method !== "GET" && csrf ? { [CSRF_HEADER]: CSRF_HEADER_VALUE } : {}),
      },
      body: method === "GET" ? undefined : (raw ?? JSON.stringify(body)),
    }),
    { params: Promise.resolve({ id }) },
  );
}

function signedUrl(extra: Record<string, string>) {
  const pairs: [string, string][] = [
    ["shop", DOMAIN_A],
    ["path_prefix", "/apps/bundlecraft"],
    ["timestamp", String(Math.floor(Date.now() / 1000))],
    ...Object.entries(extra),
  ];
  const message = [...pairs]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("");
  const signature = createHmac("sha256", process.env.SHOPIFY_API_SECRET ?? "")
    .update(message)
    .digest("hex");
  return `http://localhost/api/storefront/bundles?${new URLSearchParams([...pairs, ["signature", signature]])}`;
}

describe("customization API modules", () => {
  it("expose only GET, PATCH and PUT (DELETE and POST are 405)", () => {
    expect(Object.keys(customizationRoute).sort()).toEqual(["GET", "PATCH", "PUT"]);
  });
});

describe.skipIf(!canRun)("bundle customization API (live database)", () => {
  let shopA: string;
  let shopB: string;
  let cookieA: string;
  let cookieB: string;
  let bundle: string;
  let otherShopBundle: string;

  const stored = () => prisma.customization.findUnique({ where: { bundleId: bundle } });

  beforeAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    const secret = process.env.SESSION_SECRET!;
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
    cookieA = await createSessionToken({ shopId: shopA, shopDomain: DOMAIN_A }, secret);
    cookieB = await createSessionToken({ shopId: shopB, shopDomain: DOMAIN_B }, secret);
    bundle = (await createBundleSeeded(shopA, input("Design me"))).id;
    otherShopBundle = (await createBundleSeeded(shopB, input("Not yours"))).id;
  });
  afterAll(async () => {
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    currentCookie = cookieA;
    await prisma.customization.deleteMany({ where: { bundleId: bundle } });
    await prisma.bundle.update({ where: { id: bundle }, data: { status: "draft" } });
  });

  describe("authentication and tenant isolation", () => {
    it("rejects anonymous, garbage and tampered sessions with 401 and no data", async () => {
      for (const forged of [undefined, "garbage", `${cookieA}x`, cookieA.split(".")[0]]) {
        currentCookie = forged;
        for (const response of [
          await call("GET", bundle),
          await call("PATCH", bundle, custom),
          await call("PUT", bundle, custom),
        ]) {
          expect(response.status).toBe(401);
          expect(JSON.stringify(await response.json())).not.toMatch(LEAKS);
        }
      }
      expect(await stored()).toBeNull();
    });

    it("refuses writes without the CSRF header (403) and stores nothing", async () => {
      for (const method of ["PATCH", "PUT"] as const) {
        const response = await call(method, bundle, custom, { csrf: false });
        expect(response.status).toBe(403);
      }
      expect(await stored()).toBeNull();
    });

    it("another shop gets 404 for read and write, and nothing changes", async () => {
      currentCookie = cookieB;
      for (const response of [
        await call("GET", bundle),
        await call("PATCH", bundle, custom),
        await call("PUT", bundle, custom),
      ]) {
        expect(response.status).toBe(404);
        expect((await json(response)).error?.code).toBe("BUNDLE_NOT_FOUND");
      }
      expect(await stored()).toBeNull();

      // ...and it can use its own bundle.
      const own = await call("PATCH", otherShopBundle, { layout: "horizontal" });
      expect(own.status).toBe(200);
    });

    it("an unknown bundle is a 404 and a malformed id a 400", async () => {
      expect((await call("GET", randomUUID())).status).toBe(404);
      for (const id of ["not-a-uuid", "1", "' OR 1=1 --"]) {
        expect((await call("GET", id)).status, id).toBe(400);
      }
    });

    it("ignores a shopId sent in the body: it is an unknown field", async () => {
      const response = await call("PATCH", bundle, { layout: "card", shopId: shopB });
      expect(response.status).toBe(422);
      expect(await stored()).toBeNull();
    });
  });

  describe("reading", () => {
    it("reports the defaults for a bundle that was never customized, without writing anything", async () => {
      const response = await call("GET", bundle);
      expect(response.status).toBe(200);
      expect((await json(response)).data?.customization).toEqual(DEFAULT_CUSTOMIZATION);
      expect(await stored()).toBeNull();
    });

    it("returns the stored customization in the nested shape, and nothing else", async () => {
      await call("PUT", bundle, custom);
      const body = await json(await call("GET", bundle));
      expect(body.data?.customization).toEqual(custom);
      expect(Object.keys(body.data!)).toEqual(["customization"]);
      expect(JSON.stringify(body)).not.toMatch(/shopId|bundleId|createdAt|updatedAt/);
    });
  });

  describe("PATCH merges, PUT replaces", () => {
    it("PATCH changes only the fields sent and keeps the rest", async () => {
      await call("PUT", bundle, custom);
      const response = await call("PATCH", bundle, {
        colors: { primary: "#000000" },
        button: { style: "filled" },
      });
      const result = (await json(response)).data!.customization!;
      expect(response.status).toBe(200);
      expect(result).toEqual({
        ...custom,
        colors: { ...custom.colors, primary: "#000000" },
        button: { style: "filled", size: "large" },
      });
      const row = await stored();
      expect(row).toMatchObject({
        primaryColor: "#000000",
        buttonColor: "#445566",
        layout: "vertical",
        buttonStyle: "filled",
        buttonSize: "large",
        fontFamily: "serif",
        cardShadow: "strong",
        spacingDensity: "compact",
      });
    });

    it("PATCH on a never-customized bundle starts from the defaults and creates the row once", async () => {
      await call("PATCH", bundle, { layout: "horizontal" });
      await call("PATCH", bundle, { spacing: { density: "compact" } });
      expect(await prisma.customization.count({ where: { bundleId: bundle } })).toBe(1);
      const body = await json(await call("GET", bundle));
      expect(body.data?.customization).toEqual({
        ...DEFAULT_CUSTOMIZATION,
        layout: "horizontal",
        spacing: { density: "compact" },
      });
    });

    it("PUT replaces everything: fields left out return to the defaults", async () => {
      await call("PUT", bundle, custom);
      const response = await call("PUT", bundle, { colors: { primary: "#abcdef" } });
      expect((await json(response)).data?.customization).toEqual({
        ...DEFAULT_CUSTOMIZATION,
        colors: { ...DEFAULT_CUSTOMIZATION.colors, primary: "#abcdef" },
      });
    });

    it("PUT with an empty object resets to the defaults (the reset action)", async () => {
      await call("PUT", bundle, custom);
      const response = await call("PUT", bundle, {});
      expect((await json(response)).data?.customization).toEqual(DEFAULT_CUSTOMIZATION);
      expect(await stored()).toMatchObject({
        primaryColor: "#111827",
        layout: "card",
        fontSize: 16,
      });
    });

    it("stores colors and options exactly as given", async () => {
      await call("PUT", bundle, custom);
      expect(await stored()).toMatchObject({
        primaryColor: "#112233",
        buttonColor: "#445566",
        backgroundColor: "#ffeecc",
        accentColor: "#778899",
        textColor: "#223344",
        fontSize: 20,
        titleSize: "large",
        descriptionSize: "small",
        cardRadius: "large",
        buttonStyle: "outline",
      });
    });
  });

  describe("invalid input is refused as a whole", () => {
    const hostile: [string, unknown][] = [
      ["a color in rgb()", { colors: { primary: "rgb(0,0,0)" } }],
      ["a url() color", { colors: { button: "url(https://evil.example/x)" } }],
      ["a CSS injection color", { colors: { primary: "#000000;}body{display:none}" } }],
      ["a script injection color", { colors: { text: "</style><script>alert(1)</script>" } }],
      ["a CSS variable color", { colors: { background: "var(--x)" } }],
      ["a short hex color", { colors: { accent: "#fff" } }],
      ["an unknown layout", { layout: "carousel" }],
      ["an arbitrary font", { typography: { fontFamily: "Comic Sans MS" } }],
      ["a font url", { typography: { fontFamily: "https://evil.example/f.css" } }],
      ["a huge font size", { typography: { fontSize: 9000 } }],
      ["a fractional font size", { typography: { fontSize: 16.5 } }],
      ["a string font size", { typography: { fontSize: "16px" } }],
      ["a bad heading size", { typography: { titleSize: "huge" } }],
      ["a bad radius", { card: { borderRadius: "50%" } }],
      ["a bad shadow", { card: { shadow: "0 0 9px red" } }],
      ["a bad button style", { button: { style: "ghost" } }],
      ["a bad button size", { button: { size: "xl" } }],
      ["a bad spacing", { spacing: { density: "tight" } }],
      ["an unknown top-level field", { css: "body{display:none}" }],
      ["an html field", { html: "<script>alert(1)</script>" }],
      ["a javascript field", { script: "alert(1)" }],
      ["an unknown nested field", { colors: { secondary: "#000000" } }],
      ["an array body", []],
      ["a string body", "layout=card"],
      ["a null body", null],
      ["a group that is not an object", { colors: "#000000" }],
    ];

    it.each(hostile)(
      "PATCH and PUT refuse %s (422), naming the field, storing nothing",
      async (_name, body) => {
        await call("PUT", bundle, custom);
        const before = await stored();
        for (const method of ["PATCH", "PUT"] as const) {
          const response = await call(method, bundle, body);
          expect(response.status, `${method} ${JSON.stringify(body)}`).toBe(422);
          const result = await json(response);
          expect(result.error?.code).toBe("VALIDATION_ERROR");
          expect(result.error?.details?.length).toBeGreaterThan(0);
          expect(JSON.stringify(result)).not.toMatch(LEAKS);
        }
        expect(await stored()).toEqual(before); // nothing was half saved
      },
    );

    it("reports every problem at once", async () => {
      const response = await call("PATCH", bundle, {
        colors: { primary: "red" },
        layout: "grid",
        extra: 1,
      });
      const fields = (await json(response)).error!.details!.map((detail) => detail.field).sort();
      expect(fields).toEqual([
        "customization.colors.primary",
        "customization.extra",
        "customization.layout",
      ]);
    });

    it("rejects a body that is not JSON with 400", async () => {
      const response = await call("PATCH", bundle, undefined, { raw: "{not json" });
      expect(response.status).toBe(400);
    });

    it("rejects an oversized body", async () => {
      const response = await call("PATCH", bundle, undefined, {
        raw: JSON.stringify({ a: "x".repeat(300_000) }),
      });
      expect([400, 413]).toContain(response.status);
    });
  });

  describe("editing rules", () => {
    it("an active bundle cannot be customized (409) until it is deactivated", async () => {
      await call("PUT", bundle, custom);
      await prisma.bundle.update({ where: { id: bundle }, data: { status: "active" } });
      for (const method of ["PATCH", "PUT"] as const) {
        const response = await call(method, bundle, { layout: "card" });
        expect(response.status).toBe(409);
        expect((await json(response)).error?.code).toBe("BUNDLE_NOT_EDITABLE");
      }
      expect((await stored())?.layout).toBe("vertical");
      expect((await call("GET", bundle)).status).toBe(200); // reading is always fine

      await prisma.bundle.update({ where: { id: bundle }, data: { status: "inactive" } });
      expect((await call("PATCH", bundle, { layout: "card" })).status).toBe(200);
    });
  });

  describe("through the bundle API", () => {
    const post = (body: unknown) =>
      createBundleRoute(
        new Request("http://localhost/api/bundles", {
          method: "POST",
          headers: { "content-type": "application/json", [CSRF_HEADER]: CSRF_HEADER_VALUE },
          body: JSON.stringify(body),
        }),
      );
    const base = {
      title: "Via API",
      bundleType: "fixed",
      templateId: null,
      requiredQuantity: null,
      discountType: "percentage",
      discountValue: 10,
      products: [{ shopifyProductId: "7001", shopifyVariantId: "70011", quantity: 1 }],
    };

    it("a partial customization is filled with the defaults", async () => {
      const response = await post({ ...base, customization: { layout: "horizontal" } });
      const created = await json(response);
      expect(response.status).toBe(201);
      expect(created.data?.bundle?.customization).toEqual({
        ...DEFAULT_CUSTOMIZATION,
        layout: "horizontal",
      });
    });

    it("refuses unknown and unsafe customization fields with 422 and creates nothing", async () => {
      const before = await prisma.bundle.count({ where: { shopId: shopA } });
      for (const customization of [
        { layout: "card", css: "x" },
        { colors: { primary: "url(x)" } },
        { typography: { fontFamily: "Arial" } },
      ]) {
        const response = await post({ ...base, customization });
        expect(response.status).toBe(422);
      }
      expect(await prisma.bundle.count({ where: { shopId: shopA } })).toBe(before);
    });

    it("template defaults become the bundle's own stored customization, which the merchant can override", async () => {
      const template = await getTemplateBySlug("seasonal-collection");
      const overridden = {
        ...template.defaults.customization,
        colors: { ...template.defaults.customization.colors, button: "#123456" },
      };
      const response = await post({
        ...base,
        title: "From template",
        templateId: template.id,
        bundleType: template.bundleType,
        requiredQuantity: template.requiredQuantity,
        customization: overridden,
      });
      const created = await json(response);
      expect(response.status).toBe(201);
      expect(created.data?.bundle?.customization).toEqual(overridden);
      expect(created.data?.bundle?.customization?.colors.button).toBe("#123456");

      // No dynamic dependency on the template afterwards: the bundle keeps its own copy.
      const row = await prisma.customization.findFirstOrThrow({
        where: { bundleId: created.data!.bundle!.id },
      });
      expect(row).toMatchObject({
        buttonColor: "#123456",
        layout: "vertical",
        fontFamily: "serif",
      });
    });

    it("GET /api/bundles/:id returns the nested customization", async () => {
      await call("PUT", bundle, custom);
      const response = await getBundleRoute(new Request(`http://localhost/api/bundles/${bundle}`), {
        params: Promise.resolve({ id: bundle }),
      });
      expect((await json(response)).data?.bundle?.customization).toEqual(custom);
    });
  });

  describe("what the storefront receives", () => {
    it("is exactly the six documented groups, for a single bundle and for the listing", async () => {
      await call("PUT", bundle, custom);
      await prisma.bundle.update({ where: { id: bundle }, data: { status: "active" } });

      const detail = await json(
        await storefrontRoute(new Request(signedUrl({ bundleId: bundle }))),
      );
      const customization = detail.data!.bundles![0].customization;
      expect(customization).toEqual(custom);
      expect(Object.keys(customization).sort()).toEqual(
        ["button", "card", "colors", "layout", "spacing", "typography"].sort(),
      );
      expect(JSON.stringify(customization)).not.toMatch(/shopId|bundleId|createdAt|updatedAt|"id"/);

      const listing = await json(
        await storefrontRoute(new Request(signedUrl({ view: "listing" }))),
      );
      const card = listing.data!.bundles!.find((b) => b.name === "Design me");
      expect(card?.customization).toEqual(custom);
    });

    it("a bundle without a saved customization gets the defaults", async () => {
      await prisma.bundle.update({ where: { id: bundle }, data: { status: "active" } });
      const detail = await json(
        await storefrontRoute(new Request(signedUrl({ bundleId: bundle }))),
      );
      expect(detail.data!.bundles![0].customization).toEqual(DEFAULT_CUSTOMIZATION);
    });

    it("an unreadable stored value falls back per field and never reaches the storefront", async () => {
      await call("PUT", bundle, custom);
      await prisma.customization.update({
        where: { bundleId: bundle },
        data: { primaryColor: "red;} body{display:none}", accentColor: "url(javascript:alert(1))" },
      });
      await prisma.bundle.update({ where: { id: bundle }, data: { status: "active" } });
      const detail = await json(
        await storefrontRoute(new Request(signedUrl({ bundleId: bundle }))),
      );
      const c = detail.data!.bundles![0].customization;
      expect(c.colors.primary).toBe(DEFAULT_CUSTOMIZATION.colors.primary);
      expect(c.colors.accent).toBe(DEFAULT_CUSTOMIZATION.colors.accent);
      expect(c.colors.button).toBe("#445566"); // valid choices survive
      expect(JSON.stringify(c)).not.toMatch(/display:none|javascript/);
    });
  });
});
