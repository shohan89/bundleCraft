import { describe, expect, it, vi } from "vitest";
import { createTracker, randomId } from "./analytics";
import { createApi, WidgetError } from "./api";
import { DEFAULT_STRINGS, format, readConfig } from "./config";
import { makeBundle } from "./testing";

const ok = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data }), { status: 200 });
const fail = (status: number, message = "internal detail") =>
  new Response(JSON.stringify({ success: false, error: { message } }), { status });

const config = { apiBase: "/apps/bundlecraft", cartAddUrl: "/cart/add.js" };

describe("createApi", () => {
  it("requests bundles through the App Proxy path and returns them", async () => {
    const doFetch = vi.fn<typeof fetch>(async () => ok({ bundles: [makeBundle()] }));
    const api = createApi(config, DEFAULT_STRINGS, doFetch);

    const bundles = await api.fetchBundles({ productId: "123" });

    expect(doFetch.mock.calls[0][0]).toBe("/apps/bundlecraft/bundles?productId=123");
    expect(bundles).toHaveLength(1);
  });

  it("prefers a specific bundle id over a product filter", async () => {
    const doFetch = vi.fn<typeof fetch>(async () => ok({ bundles: [] }));
    await createApi(config, DEFAULT_STRINGS, doFetch).fetchBundles({
      bundleId: "b1",
      productId: "123",
    });
    expect(doFetch.mock.calls[0][0]).toBe("/apps/bundlecraft/bundles?bundleId=b1");
  });

  it("shares one in-flight request per URL, and lets a failed one be retried", async () => {
    const doFetch = vi
      .fn()
      .mockResolvedValueOnce(fail(500))
      .mockResolvedValue(ok({ bundles: [] }));
    const api = createApi(config, DEFAULT_STRINGS, doFetch);

    const [first, second] = await Promise.allSettled([api.fetchBundles({}), api.fetchBundles({})]);
    expect(doFetch).toHaveBeenCalledTimes(1);
    expect(first.status).toBe("rejected");
    expect(second.status).toBe("rejected");

    await expect(api.fetchBundles({})).resolves.toEqual([]);
    expect(doFetch).toHaveBeenCalledTimes(2);
  });

  it("maps failures to customer-friendly errors and never surfaces server text", async () => {
    const attempt = (response: Response | Error) =>
      createApi(
        config,
        DEFAULT_STRINGS,
        vi.fn(async () => {
          if (response instanceof Error) throw response;
          return response;
        }),
      )
        .fetchBundles({ bundleId: "x" })
        .catch((error: WidgetError) => error);

    const unavailable = await attempt(fail(404));
    expect(unavailable).toMatchObject({
      code: "UNAVAILABLE",
      message: DEFAULT_STRINGS.unavailable,
    });

    const server = await attempt(fail(500, "PrismaClientKnownRequestError at select * from shops"));
    expect(server).toMatchObject({ code: "ERROR", message: DEFAULT_STRINGS.error });

    const network = await attempt(new TypeError("Failed to fetch"));
    expect(network).toMatchObject({ code: "NETWORK", message: DEFAULT_STRINGS.network });

    const notJson = await attempt(new Response("<html>bad gateway</html>", { status: 502 }));
    expect(notJson).toMatchObject({ code: "ERROR", message: DEFAULT_STRINGS.error });
  });

  it("prepareCart posts the selection and returns the server-built cart lines", async () => {
    const lines = [{ id: 11, quantity: 1, properties: { _bundle_id: "b" } }];
    const doFetch = vi.fn(async () => ok({ items: lines }));
    const result = await createApi(config, DEFAULT_STRINGS, doFetch).prepareCart("b1", [
      { key: "11", variantId: "11", quantity: 1 },
    ]);

    expect(result).toEqual(lines);
    const [url, init] = doFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/apps/bundlecraft/cart");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      bundleId: "b1",
      selection: [{ key: "11", variantId: "11", quantity: 1 }],
    });
  });

  it("surfaces the server's own validation message for rejected selections (422)", async () => {
    const api = createApi(
      config,
      DEFAULT_STRINGS,
      vi.fn(async () => fail(422, "Choose 2 more items.")),
    );
    await expect(api.prepareCart("b1", [])).rejects.toMatchObject({
      code: "INVALID_SELECTION",
      message: "Choose 2 more items.",
    });
  });

  it("adds lines to Shopify's own cart endpoint", async () => {
    const doFetch = vi.fn(async () => new Response("{}", { status: 200 }));
    await createApi(config, DEFAULT_STRINGS, doFetch).addToCart([
      { id: 11, quantity: 1, properties: {} },
    ]);
    const [url, init] = doFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/cart/add.js");
    expect(JSON.parse(init.body as string)).toEqual({
      items: [{ id: 11, quantity: 1, properties: {} }],
    });
  });

  it("uses Shopify's cart error text when present, else a friendly default", async () => {
    const withDescription = createApi(
      config,
      DEFAULT_STRINGS,
      vi.fn(
        async () =>
          new Response(JSON.stringify({ description: "All 5 Tee are in your cart." }), {
            status: 422,
          }),
      ),
    );
    await expect(withDescription.addToCart([])).rejects.toMatchObject({
      code: "CART",
      message: "All 5 Tee are in your cart.",
    });

    const without = createApi(
      config,
      DEFAULT_STRINGS,
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    await expect(without.addToCart([])).rejects.toMatchObject({
      message: DEFAULT_STRINGS.cartFailed,
    });

    const offline = createApi(
      config,
      DEFAULT_STRINGS,
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    await expect(offline.addToCart([])).rejects.toMatchObject({ code: "NETWORK" });
  });
});

describe("createTracker", () => {
  it("reports each bundle's view once per page, but every add", () => {
    const send = vi.fn(async () => {});
    let n = 0;
    const tracker = createTracker(send, () => `id-${++n}`);
    tracker.view("a");
    tracker.view("a");
    tracker.view("b");
    tracker.add("a", "instance-1");
    tracker.add("a");
    expect(send.mock.calls).toEqual([
      [{ bundleId: "a", event: "bundle_view", eventId: "id-1" }],
      [{ bundleId: "b", event: "bundle_view", eventId: "id-2" }],
      [{ bundleId: "a", event: "bundle_add", eventId: "id-3", instanceId: "instance-1" }],
      [{ bundleId: "a", event: "bundle_add", eventId: "id-4" }],
    ]);
  });

  it("gives every event a valid UUID idempotency id by default", () => {
    const send = vi.fn(async () => {});
    createTracker(send).view("a");
    expect((send.mock.calls[0] as unknown[])[0]).toMatchObject({
      eventId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
    });
    expect(randomId()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("swallows a synchronous send failure too", () => {
    const tracker = createTracker(() => {
      throw new Error("sync boom");
    });
    expect(() => tracker.view("a")).not.toThrow();
    expect(() => tracker.add("a")).not.toThrow();
  });

  it("swallows send failures", async () => {
    const tracker = createTracker(async () => {
      throw new Error("boom");
    });
    expect(() => tracker.view("a")).not.toThrow();
    await Promise.resolve();
  });
});

describe("config", () => {
  const root = (attributes: Record<string, string>) => {
    const node = document.createElement("div");
    for (const [key, value] of Object.entries(attributes)) node.dataset[key] = value;
    return node;
  };

  it("reads Liquid-provided values with safe defaults, and rejects a non-numeric product id", () => {
    const config = readConfig(
      root({ apiBase: "/fr/apps/bundlecraft/", productId: "12x", mode: "weird" }),
    );
    expect(config).toMatchObject({
      apiBase: "/fr/apps/bundlecraft",
      productId: null,
      mode: "product",
      cartAddUrl: "/cart/add.js",
    });
  });

  it("merges merchant translations over the defaults and ignores junk", () => {
    const config = readConfig(
      root({ strings: JSON.stringify({ add: "Ajouter", nope: "x", loading: "" }) }),
    );
    expect(config.strings.add).toBe("Ajouter");
    expect(config.strings.loading).toBe(DEFAULT_STRINGS.loading);
    expect(readConfig(root({ strings: "{not json" })).strings).toEqual(DEFAULT_STRINGS);
  });

  it("formats placeholders and leaves unknown ones untouched", () => {
    expect(format("Selected: {count} / {total}", { count: 2, total: 3 })).toBe("Selected: 2 / 3");
    expect(format("Hi {name}", {})).toBe("Hi {name}");
  });
});
