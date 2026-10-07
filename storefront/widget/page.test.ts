import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flush, makeBundle, makeCard, product } from "./testing";

const fetchMock = vi.fn();
const envelope = (data: unknown, status = 200) =>
  new Response(
    JSON.stringify(
      status < 400
        ? { success: true, data }
        : { success: false, error: { message: "internal detail" } },
    ),
    { status },
  );

function widgetRoot(attributes: Record<string, string> = {}): HTMLElement {
  const root = document.createElement("div");
  root.setAttribute("data-bundlecraft-widget", "");
  root.dataset.mode = "product";
  root.dataset.productId = "123";
  root.dataset.currency = "USD";
  root.dataset.locale = "en-US";
  root.dataset.apiBase = "/apps/bundlecraft";
  root.dataset.heading = "Complete your look";
  for (const [key, value] of Object.entries(attributes)) root.dataset[key] = value;
  document.body.append(root);
  return root;
}

/** Loads a fresh copy of the widget entry point (it auto-starts on import, like the real script). */
async function startWidget() {
  vi.resetModules();
  await import("./index");
  await flush();
}

beforeEach(() => {
  document.body.replaceChildren();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const callsTo = (fragment: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes(fragment));

describe("product page widget", () => {
  it("shows a loading state, then renders the bundles found for the current product", async () => {
    let respond: (r: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (respond = resolve)));
    fetchMock.mockResolvedValue(envelope({ accepted: true }, 202));
    const root = widgetRoot();

    await startWidget();
    expect(root.querySelector(".bc-state--loading")!.textContent).toContain("Loading bundle…");
    expect(root.getAttribute("aria-busy")).toBe("true");

    respond(envelope({ bundles: [makeBundle()] }));
    await flush();

    expect(root.querySelector(".bc-heading")!.textContent).toBe("Complete your look");
    expect(root.querySelector(".bc-title")!.textContent).toBe("Complete Look");
    expect(root.hasAttribute("aria-busy")).toBe(false);
    expect(fetchMock.mock.calls[0][0]).toBe("/apps/bundlecraft/bundles?productId=123");
  });

  it("asks for one specific bundle when the merchant configured a bundle id", async () => {
    fetchMock.mockResolvedValue(envelope({ bundles: [makeBundle()] }));
    widgetRoot({ bundleId: "5f0c6a6e-8f0e-4c53-9b64-6f7f3f2b9a11" });
    await startWidget();
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/apps/bundlecraft/bundles?bundleId=5f0c6a6e-8f0e-4c53-9b64-6f7f3f2b9a11",
    );
  });

  it("hides itself completely when the product has no bundles (no empty box in the theme)", async () => {
    fetchMock.mockResolvedValue(envelope({ bundles: [] }));
    const root = widgetRoot();
    await startWidget();
    expect(root.hidden).toBe(true);
  });

  it("shows an empty-state message when the merchant enabled it", async () => {
    fetchMock.mockResolvedValue(envelope({ bundles: [] }));
    const root = widgetRoot({ showEmpty: "true" });
    await startWidget();
    expect(root.hidden).toBe(false);
    expect(root.querySelector(".bc-state--empty")!.textContent).toBe(
      "No bundles are available right now.",
    );
  });

  it("hides quietly when the bundle is unavailable (inactive/removed) instead of breaking the page", async () => {
    fetchMock.mockResolvedValue(envelope(null, 404));
    const root = widgetRoot({ bundleId: "5f0c6a6e-8f0e-4c53-9b64-6f7f3f2b9a11" });
    await startWidget();
    expect(root.hidden).toBe(true);
  });

  it("shows a friendly, retryable error for backend failures without leaking server detail", async () => {
    fetchMock.mockResolvedValueOnce(envelope(null, 500));
    const root = widgetRoot();
    await startWidget();

    const error = root.querySelector(".bc-state--error")!;
    expect(error.getAttribute("role")).toBe("alert");
    expect(error.textContent).toContain("Something went wrong. Please try again.");
    expect(root.textContent).not.toContain("internal detail");

    fetchMock.mockResolvedValue(envelope({ bundles: [makeBundle()] }));
    await userEvent.click(root.querySelector("button")!);
    await flush();
    expect(root.querySelector(".bc-title")!.textContent).toBe("Complete Look");
  });

  it("shows a network-specific message when the request can't be made", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const root = widgetRoot();
    await startWidget();
    expect(root.querySelector(".bc-state--error")!.textContent).toContain(
      "Couldn't reach the store",
    );
    expect(root.textContent).not.toContain("Failed to fetch");
  });
});

describe("performance behaviour", () => {
  it("makes one request for several widgets on the same page", async () => {
    fetchMock.mockResolvedValue(envelope({ bundles: [makeBundle()] }));
    widgetRoot();
    widgetRoot();
    await startWidget();
    expect(callsTo("/bundles")).toHaveLength(1);
  });

  it("does not fetch anything until the widget nears the viewport", async () => {
    let trigger: (entries: { isIntersecting: boolean }[]) => void = () => {};
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: typeof trigger) {
          trigger = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    fetchMock.mockResolvedValue(envelope({ bundles: [makeBundle()] }));
    const root = widgetRoot();

    await startWidget();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(root.children).toHaveLength(0);

    trigger([{ isIntersecting: true }]);
    await flush();
    expect(callsTo("/bundles")).toHaveLength(1);
    expect(root.querySelector(".bc-title")).not.toBeNull();
  });

  it("starts each widget only once even if init runs again", async () => {
    fetchMock.mockResolvedValue(envelope({ bundles: [makeBundle()] }));
    widgetRoot();
    await startWidget();
    window.BundleCraft!.init();
    await flush();
    expect(callsTo("/bundles")).toHaveLength(1);
  });
});

describe("analytics integration points", () => {
  it("sends bundle_view once when the bundle renders, and bundle_add after a successful add", async () => {
    // Shopify's own cart endpoint, our cart validation, bundles, and events
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/cart/add.js") return new Response("{}", { status: 200 });
      if (url.includes("/bundles")) return envelope({ bundles: [makeBundle()] });
      if (url.includes("/apps/bundlecraft/cart"))
        return envelope({ items: [{ id: 11, quantity: 1, properties: {} }] });
      return envelope({ accepted: true }, 202);
    });
    const root = widgetRoot();
    await startWidget();

    const events = () => callsTo("/events").map(([, init]) => JSON.parse(init.body).event);
    expect(events()).toEqual(["bundle_view"]);

    await userEvent.click(root.querySelector(".bc-button")!);
    await flush();
    await flush();

    expect(events()).toEqual(["bundle_view", "bundle_add"]);
    expect(callsTo("/events")[0][0]).toBe("/apps/bundlecraft/events");
  });

  it("never lets a failing analytics call affect the shopper", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/events")) throw new TypeError("blocked by an ad blocker");
      return envelope({ bundles: [makeBundle()] });
    });
    const root = widgetRoot();
    await startWidget();
    expect(root.querySelector(".bc-title")!.textContent).toBe("Complete Look");
    expect(root.querySelector(".bc-state--error")).toBeNull();
  });
});

describe("bundle landing page (listing)", () => {
  const listing = (extra: Record<string, string> = {}) =>
    widgetRoot({ mode: "listing", productId: "", heading: "Bundles", ...extra });
  const LISTING_URL = "/apps/bundlecraft/bundles?view=listing";

  it("asks for the light card projection, not full bundles, and lists cards", async () => {
    fetchMock.mockResolvedValue(
      envelope({
        bundles: [
          makeCard({ id: "a0000000-0000-4000-8000-000000000001", name: "Complete Look" }),
          makeCard({
            id: "a0000000-0000-4000-8000-000000000002",
            name: "Skincare Routine",
            type: "mix_match",
            requiredQuantity: 3,
            productCount: 5,
            pricing: null,
            discount: { type: "fixed_amount", value: 15 },
          }),
        ],
      }),
    );
    const root = listing();
    await startWidget();

    expect(fetchMock.mock.calls[0][0]).toBe(LISTING_URL);
    expect(root.querySelector("h2.bc-heading")!.textContent).toBe("Bundles");
    const cards = [...root.querySelectorAll(".bc-bundle-card")];
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain("Complete Look");
    expect(cards[0].textContent).toContain("Fixed bundle · 3 products");
    expect(cards[0].textContent).toContain("Save 20%");
    expect(cards[0].textContent).toContain("$48.00");
    expect(cards[1].textContent).toContain("Mix & match · 5 products · Choose 3 items");
    expect(cards[1].textContent).toContain("Save $15.00");
  });

  it("shows a placeholder grid while loading, and no analytics from merely listing", async () => {
    let respond: (r: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (respond = resolve)));
    const root = listing();
    await startWidget();
    expect(root.querySelector(".bc-placeholder")).not.toBeNull();
    expect(root.getAttribute("aria-busy")).toBe("true");

    respond(envelope({ bundles: [makeCard()] }));
    await flush();
    expect(root.querySelector(".bc-placeholder")).toBeNull();
    expect(callsTo("/events")).toHaveLength(0);
  });

  it("expands a card into the full interactive widget on demand, loading it only once", async () => {
    const card = makeCard({ id: "a0000000-0000-4000-8000-000000000001" });
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("bundleId=")
        ? envelope({
            bundles: [makeBundle({ id: card.id, products: [product("11"), product("21")] })],
          })
        : url.includes("/events")
          ? envelope({ accepted: true }, 202)
          : envelope({ bundles: [card] }),
    );
    const root = listing();
    await startWidget();

    const toggle = root.querySelector<HTMLButtonElement>("button[aria-controls]")!;
    const panel = root.querySelector<HTMLElement>(`#${toggle.getAttribute("aria-controls")}`)!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(panel.hidden).toBe(true);
    expect(callsTo("bundleId=")).toHaveLength(0);

    await userEvent.click(toggle);
    await flush();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.textContent).toBe("Hide bundle");
    expect(panel.hidden).toBe(false);
    expect(panel.querySelectorAll(".bc-card")).toHaveLength(2);

    await userEvent.click(toggle); // collapse
    await userEvent.click(toggle); // expand again: no second load
    await flush();
    expect(callsTo("bundleId=")).toHaveLength(1);
    // Opening the bundle is what counts as a view, once.
    expect(callsTo("/events").map(([, init]) => JSON.parse(init.body).event)).toEqual([
      "bundle_view",
    ]);
  });

  it("shows a retryable error inside the card if the details can't be loaded", async () => {
    const card = makeCard({ id: "a0000000-0000-4000-8000-000000000001" });
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("bundleId=") ? envelope(null, 500) : envelope({ bundles: [card] }),
    );
    const root = listing();
    await startWidget();

    await userEvent.click(root.querySelector<HTMLButtonElement>("button[aria-controls]")!);
    await flush();
    expect(root.querySelector(".bc-panel .bc-state--error")).not.toBeNull();
  });

  it("shows the empty state (with the heading) when there are no active bundles", async () => {
    fetchMock.mockResolvedValue(envelope({ bundles: [] }));
    const root = listing();
    await startWidget();
    expect(root.querySelector(".bc-state--empty")!.textContent).toBe(
      "No bundles are available right now.",
    );
    expect(root.querySelector(".bc-heading")).not.toBeNull();
    expect(root.hidden).toBe(false);
  });

  it("shows a safe retryable error when the list cannot be loaded, and retry refetches", async () => {
    fetchMock.mockResolvedValueOnce(envelope(null, 500));
    const root = listing();
    await startWidget();
    const error = root.querySelector(".bc-state--error")!;
    expect(error.textContent).toContain("Something went wrong");
    expect(root.textContent).not.toContain("internal detail");

    fetchMock.mockResolvedValue(envelope({ bundles: [makeCard()] }));
    await userEvent.click(error.querySelector("button")!);
    await flush();
    expect(root.querySelectorAll(".bc-bundle-card")).toHaveLength(1);
    expect(callsTo("view=listing")).toHaveLength(2);
  });

  it("uses one listing request for several blocks on the same page", async () => {
    fetchMock.mockResolvedValue(envelope({ bundles: [makeCard()] }));
    listing();
    listing();
    await startWidget();
    expect(callsTo("view=listing")).toHaveLength(1);
  });
});
