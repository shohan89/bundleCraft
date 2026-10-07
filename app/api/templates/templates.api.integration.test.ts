// @vitest-environment node
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CSRF_HEADER, CSRF_HEADER_VALUE } from "@/lib/api/csrf";
import { createSessionToken } from "@/lib/auth/session";
import { TEMPLATE_CATALOG } from "@/lib/templates/catalog";
import type { TemplateDto } from "@/lib/templates/types";
import { prisma } from "@/lib/prisma";
import { seedCatalog } from "@/services/products/testing";
import { seedTemplates } from "@/services/templates/seed";
import { POST as createBundleRoute } from "../bundles/route";
import { PATCH as updateBundleRoute } from "../bundles/[id]/route";
import * as detailModule from "./[id]/route";
import * as listModule from "./route";

let currentCookie: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "bundlecraft_session" && currentCookie ? { name, value: currentCookie } : undefined,
  }),
}));

const canRun = Boolean(process.env.DATABASE_URL) && Boolean(process.env.SESSION_SECRET);
const DOMAIN_A = "bundlecraft-templates-api-a.myshopify.com";
const DOMAIN_B = "bundlecraft-templates-api-b.myshopify.com";
const LEAKS = /prisma|stack|node_modules|postgres|shpat_|configurationJson|at .*\(.*:\d+:\d+\)/i;

interface Envelope {
  success: boolean;
  data?: {
    templates?: TemplateDto[];
    template?: TemplateDto;
    bundle?: { id: string; templateId: string | null };
  };
  error?: { code: string; message: string };
}
const json = async (response: Response) => (await response.json()) as Envelope;

const list = (query = "") => listModule.GET(new Request(`http://localhost/api/templates${query}`));
const detail = (id: string) =>
  detailModule.GET(new Request(`http://localhost/api/templates/${id}`), {
    params: Promise.resolve({ id }),
  });
const send = (route: (r: Request, c: never) => Promise<Response>, body: unknown, id?: string) =>
  route(
    new Request("http://localhost/api/bundles", {
      method: id ? "PATCH" : "POST",
      headers: { "content-type": "application/json", [CSRF_HEADER]: CSRF_HEADER_VALUE },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) } as never,
  );

describe("template API modules", () => {
  it("are read-only: only GET handlers exist, so every write method is a 405", () => {
    expect(Object.keys(listModule).sort()).toEqual(["GET"]);
    expect(Object.keys(detailModule).sort()).toEqual(["GET"]);
  });
});

describe.skipIf(!canRun)("template API (live database)", () => {
  let cookieA: string;
  let shopA: string;
  const retired = { id: randomUUID(), slug: `test-api-retired-${randomUUID().slice(0, 8)}` };
  let completeLook: string;

  beforeAll(async () => {
    await seedTemplates(prisma);
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    const secret = process.env.SESSION_SECRET!;
    shopA = (
      await prisma.shop.create({
        data: { shopDomain: DOMAIN_A, accessToken: "x", email: "a@example.com" },
      })
    ).id;
    const shopB = (
      await prisma.shop.create({
        data: { shopDomain: DOMAIN_B, accessToken: "x", email: "b@example.com" },
      })
    ).id;
    cookieA = await createSessionToken({ shopId: shopA, shopDomain: DOMAIN_A }, secret);
    await createSessionToken({ shopId: shopB, shopDomain: DOMAIN_B }, secret);
    await seedCatalog(shopA, [{ productId: "8001", variantId: "80011" }]);
    await prisma.template.create({
      data: {
        ...retired,
        name: `Retired ${retired.slug}`,
        category: "fashion",
        configurationJson: TEMPLATE_CATALOG[0].configuration as unknown as object,
        isActive: false,
      },
    });
    completeLook = (await prisma.template.findUniqueOrThrow({ where: { slug: "complete-look" } }))
      .id;
  });
  afterAll(async () => {
    await prisma.template.deleteMany({ where: { slug: retired.slug } });
    await prisma.shop.deleteMany({ where: { shopDomain: { in: [DOMAIN_A, DOMAIN_B] } } });
    await prisma.$disconnect();
  });
  beforeEach(() => {
    currentCookie = cookieA;
  });

  describe("authentication", () => {
    it("rejects anonymous, garbage and tampered sessions with 401 and no data", async () => {
      for (const forged of [undefined, "garbage", `${cookieA}x`, cookieA.split(".")[0]]) {
        currentCookie = forged;
        for (const response of [await list(), await detail(completeLook)]) {
          expect(response.status).toBe(401);
          const text = JSON.stringify(await response.json());
          expect(text).not.toMatch(LEAKS);
          expect(text).not.toContain("Complete Look");
        }
      }
    });
  });

  describe("GET /api/templates", () => {
    it("returns the five active templates in the safe public shape", async () => {
      const response = await list();
      const body = await json(response);
      expect(response.status).toBe(200);
      const own = body.data!.templates!.filter((t) =>
        TEMPLATE_CATALOG.some((c) => c.slug === t.slug),
      );
      expect(own).toHaveLength(5);
      expect(JSON.stringify(body)).not.toMatch(LEAKS);
      for (const template of body.data!.templates!) {
        expect(Object.keys(template).sort()).toEqual(
          [
            "bundleType",
            "category",
            "defaults",
            "description",
            "id",
            "intendedUse",
            "name",
            "requiredQuantity",
            "sections",
            "slug",
            "suggestedProductCount",
          ].sort(),
        );
      }
    });

    it("does not list retired templates", async () => {
      const body = await json(await list());
      expect(body.data!.templates!.map((t) => t.slug)).not.toContain(retired.slug);
    });

    it("filters by category", async () => {
      const fashion = await json(await list("?category=fashion"));
      const beauty = await json(await list("?category=beauty"));
      expect(fashion.data!.templates!.every((t) => t.category === "fashion")).toBe(true);
      expect(beauty.data!.templates!.every((t) => t.category === "beauty")).toBe(true);
      expect(
        beauty.data!.templates!.filter((t) => TEMPLATE_CATALOG.some((c) => c.slug === t.slug)),
      ).toHaveLength(2);
    });

    it("rejects unknown filters, an invalid category and a client-supplied shop id with 400", async () => {
      for (const query of [
        "?category=toys",
        `?shopId=${shopA}`,
        "?isActive=false",
        "?status=inactive",
        "?category=fashion&category=beauty",
      ]) {
        const response = await list(query);
        expect(response.status, query).toBe(400);
        expect((await json(response)).error?.code).toBe("INVALID_REQUEST");
      }
    });
  });

  describe("GET /api/templates/:id", () => {
    it("returns one template with its validated defaults", async () => {
      const response = await detail(completeLook);
      const body = await json(response);
      expect(response.status).toBe(200);
      expect(body.data!.template).toMatchObject({
        slug: "complete-look",
        name: "Complete Look",
        category: "fashion",
        bundleType: "fixed",
        defaults: { discountType: "percentage", discountValue: 15 },
      });
    });

    it("returns 404 with one safe message for unknown and retired templates", async () => {
      const messages = new Set<string>();
      for (const id of [randomUUID(), retired.id]) {
        const response = await detail(id);
        expect(response.status).toBe(404);
        const body = await json(response);
        expect(body.error?.code).toBe("TEMPLATE_NOT_FOUND");
        messages.add(body.error!.message);
        expect(JSON.stringify(body)).not.toMatch(LEAKS);
      }
      expect(messages.size).toBe(1);
    });

    it("returns 400 for a malformed id, including injection-looking ones", async () => {
      for (const id of ["complete-look", "1", "not-a-uuid", "' OR 1=1 --", "../../etc/passwd"]) {
        const response = await detail(id);
        expect(response.status, id).toBe(400);
        expect(JSON.stringify(await json(response))).not.toMatch(LEAKS);
      }
    });
  });

  describe("choosing a template through the bundle API", () => {
    const body = (over: Record<string, unknown> = {}) => ({
      title: "API bundle",
      bundleType: "fixed",
      templateId: completeLook,
      requiredQuantity: null,
      discountType: "percentage",
      discountValue: 15,
      products: [{ shopifyProductId: "8001", shopifyVariantId: "80011", quantity: 1 }],
      ...over,
    });

    it("creates a draft that references the template", async () => {
      const response = await send(createBundleRoute, body());
      const result = await json(response);
      expect(response.status).toBe(201);
      expect(result.data!.bundle!.templateId).toBe(completeLook);
    });

    it("refuses an unknown or retired template with a safe 422", async () => {
      for (const templateId of [randomUUID(), retired.id]) {
        const response = await send(createBundleRoute, body({ templateId }));
        expect(response.status).toBe(422);
        const result = await json(response);
        expect(result.error?.code).toBe("INVALID_TEMPLATE");
        expect(JSON.stringify(result)).not.toMatch(LEAKS);
      }
    });

    it("refuses a forged template configuration or extra fields (strict input)", async () => {
      for (const extra of [
        { template: { bundleType: "volume" } },
        { templateConfiguration: { discount: { type: "percentage", value: 100 } } },
        { configurationJson: {} },
        { status: "active" },
        { shopId: randomUUID() },
      ]) {
        const response = await send(createBundleRoute, body(extra));
        expect(response.status, JSON.stringify(extra)).toBe(422);
      }
    });

    it("rejects a malformed template id as invalid input", async () => {
      const response = await send(createBundleRoute, body({ templateId: "complete-look" }));
      expect(response.status).toBe(422);
      expect((await json(response)).error?.code).toBe("VALIDATION_ERROR");
    });

    it("cannot switch an existing draft to a retired template, and reports it safely", async () => {
      const created = await json(await send(createBundleRoute, body()));
      const id = created.data!.bundle!.id;
      const response = await send(updateBundleRoute, { templateId: retired.id }, id);
      expect(response.status).toBe(422);
      expect((await json(response)).error?.code).toBe("INVALID_TEMPLATE");
    });

    it("write attempts without the CSRF header never reach the catalog", async () => {
      const before = await prisma.template.count();
      const response = await createBundleRoute(
        new Request("http://localhost/api/bundles", {
          method: "POST",
          body: JSON.stringify(body()),
        }),
      );
      expect(response.status).toBe(403);
      expect(await prisma.template.count()).toBe(before);
    });
  });
});
