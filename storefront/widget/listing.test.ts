import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseStorefrontQuery } from "@/lib/storefront/validation";
import { bundleAvailability } from "@/lib/storefront/availability";
import { mountListing } from "./listing";
import { sizedImageUrl } from "./dom";
import { flush, makeBundle, makeCard, makeConfig, makeContext, product } from "./testing";

let container: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  container = document.createElement("div");
  document.body.append(container);
});

const mount = (cards = [makeCard()], overrides = {}, config = makeConfig()) => {
  const made = makeContext(overrides, config);
  mountListing(container, cards, made.ctx);
  return made;
};
const card = () => container.querySelector<HTMLElement>(".bc-bundle-card")!;
const button = () => container.querySelector<HTMLButtonElement>("button[aria-controls]")!;

describe("bundle cards", () => {
  it("renders a semantic list of articles, each named by its own heading", () => {
    mount([makeCard(), makeCard({ id: "5f0c6a6e-8f0e-4c53-9b64-6f7f3f2b9a12", name: "Second" })]);
    const items = container.querySelectorAll("ul.bc-listing > li");
    expect(items).toHaveLength(2);
    const articles = container.querySelectorAll("article");
    expect(articles).toHaveLength(2);
    for (const article of articles) {
      const heading = article.querySelector("h3")!;
      expect(article.getAttribute("aria-labelledby")).toBe(heading.id);
    }
    expect(new Set([...container.querySelectorAll("h3")].map((h) => h.id)).size).toBe(2);
  });

  it("shows name, type, product count, description, discount and pricing", () => {
    mount([makeCard({ description: "Everything you need." })]);
    const text = card().textContent!;
    expect(text).toContain("Complete Look");
    expect(text).toContain("Fixed bundle · 3 products");
    expect(text).toContain("Everything you need.");
    expect(text).toContain("Save 20%");
    expect(card().querySelector(".bc-price-now")!.textContent).toBe("$48.00");
    expect(card().querySelector(".bc-price-was")!.textContent).toBe("$60.00");
  });

  it("formats fixed-amount discounts in the store currency", () => {
    mount([makeCard({ discount: { type: "fixed_amount", value: 12 }, pricing: null })]);
    expect(card().textContent).toContain("Save $12.00");
  });

  it("never claims a final checkout price: it says the discount is applied at checkout", () => {
    mount();
    expect(card().textContent).toContain("The discount is applied at checkout.");
    expect(card().textContent).not.toMatch(/you will pay|final price|guaranteed/i);
  });

  it("hides the crossed-out price when there is no saving", () => {
    mount([makeCard({ pricing: { subtotal: 60, total: 60, savings: 0 } })]);
    expect(card().querySelector(".bc-price-was")).toBeNull();
  });

  it("gives the price accessible labels (screen readers hear which is which)", () => {
    mount();
    const spoken = [...card().querySelectorAll(".bc-price .bc-sr-only")].map((n) => n.textContent);
    expect(spoken).toEqual(["Bundle price: ", "Regular price: "]);
  });

  it("does not invent a price for quantity or mix & match bundles", () => {
    mount([makeCard({ type: "quantity", requiredQuantity: 3, pricing: null })]);
    expect(card().querySelector(".bc-price")).toBeNull();
    expect(card().textContent).toContain("Quantity bundle · 3 products · Choose 3 items");
    expect(card().textContent).toContain("Price depends on your selection.");
    expect(button().textContent).toBe("Choose items");
  });

  it("uses type-specific call to action text", () => {
    mount([makeCard({ type: "fixed" })]);
    expect(button().textContent).toBe("View bundle");
    mount([makeCard({ type: "mix_match", requiredQuantity: 2, pricing: null })]);
    expect(button().textContent).toBe("Choose items");
  });
});

describe("product previews", () => {
  it("shows product images with alt text, sized for the card, lazily", () => {
    mount([
      makeCard({
        preview: [{ title: "Shirt", imageUrl: "https://cdn.shopify.com/s/files/shirt.jpg?v=1" }],
        productCount: 1,
      }),
    ]);
    const image = container.querySelector<HTMLImageElement>("img.bc-preview-image")!;
    expect(image.alt).toBe("Shirt");
    expect(image.getAttribute("loading")).toBe("lazy");
    expect(image.getAttribute("width")).toBe("120");
    const url = new URL(image.src);
    expect(url.searchParams.get("width")).toBe("240");
    expect(url.searchParams.get("v")).toBe("1");
  });

  it("uses a named placeholder when a product has no usable image", () => {
    mount([
      makeCard({
        preview: [
          { title: "Shirt", imageUrl: null },
          { title: "Scarf", imageUrl: "http://insecure.example/x.png" },
          { title: "Hat", imageUrl: "javascript:alert(1)" },
        ],
      }),
    ]);
    expect(container.querySelector("img")).toBeNull();
    const names = [...container.querySelectorAll(".bc-image--empty")].map((n) =>
      n.getAttribute("aria-label"),
    );
    expect(names).toEqual(["Shirt", "Scarf", "Hat"]);
  });

  it("says how many more products there are beyond the preview", () => {
    const four = ["A", "B", "C", "D"].map((title) => ({ title, imageUrl: null }));
    mount([makeCard({ productCount: 7, preview: four })]);
    expect(container.querySelector(".bc-preview-more")!.textContent).toBe("+3 more");
  });

  it("does not claim more products when the lines only repeat products already shown", () => {
    mount([makeCard({ productCount: 4 })]); // three previews, four lines (one product twice)
    expect(container.querySelector(".bc-preview-more")).toBeNull();
  });

  it("omits the preview list entirely when there is nothing to preview", () => {
    mount([makeCard({ preview: [] })]);
    expect(container.querySelector(".bc-previews")).toBeNull();
  });

  it("only resizes Shopify CDN images", () => {
    expect(sizedImageUrl("https://cdn.shopify.com/a.jpg", 240)).toBe(
      "https://cdn.shopify.com/a.jpg?width=240",
    );
    expect(sizedImageUrl("https://example.com/a.jpg", 240)).toBe("https://example.com/a.jpg");
    expect(sizedImageUrl("/local.jpg", 240)).toBe("/local.jpg");
  });
});

describe("availability", () => {
  it.each([
    ["sold_out", "Currently sold out"],
    ["unavailable", "Currently unavailable"],
  ] as const)("%s: says so in text and cannot be opened", async (availability, message) => {
    const { api } = mount([makeCard({ availability })]);
    expect(card().querySelector(".bc-availability")!.textContent).toBe(message);
    expect(button().disabled).toBe(true);
    await userEvent.click(button());
    expect(api.fetchBundles).not.toHaveBeenCalled();
  });

  it.each(["available", "unknown"] as const)("%s: can be opened, with no status message", (a) => {
    mount([makeCard({ availability: a })]);
    expect(button().disabled).toBe(false);
    expect(card().querySelector(".bc-availability")).toBeNull();
  });
});

describe("opening a bundle", () => {
  const open = makeBundle({ products: [product("11"), product("21")] });

  it("loads the full bundle once through the existing widget, and reports one view", async () => {
    const { api, tracker } = mount([makeCard({ id: open.id })], {
      fetchBundles: vi.fn(async () => [open]),
    });
    expect(tracker.view).not.toHaveBeenCalled(); // listing alone is not a view

    await userEvent.click(button());
    await flush();
    expect(api.fetchBundles).toHaveBeenCalledWith({ bundleId: open.id });
    expect(container.querySelectorAll(".bc-panel .bc-card")).toHaveLength(2);
    expect(tracker.view).toHaveBeenCalledTimes(1);
    expect(tracker.view).toHaveBeenCalledWith(open.id);

    await userEvent.click(button());
    await userEvent.click(button());
    expect(api.fetchBundles).toHaveBeenCalledTimes(1);
    expect(tracker.add).not.toHaveBeenCalled(); // never on view
  });

  it("marks the open card so the theme can give it the full row", async () => {
    mount([makeCard({ id: open.id })], { fetchBundles: vi.fn(async () => [open]) });
    await userEvent.click(button());
    expect(container.querySelector(".bc-listing-item")!.classList).toContain(
      "bc-listing-item--open",
    );
    await userEvent.click(button());
    expect(container.querySelector(".bc-listing-item")!.classList).not.toContain(
      "bc-listing-item--open",
    );
  });

  it("keeps the cart flow: prepare, add, then bundle_add only after Shopify accepts", async () => {
    const order: string[] = [];
    const { ctx, api, tracker } = makeContext({
      fetchBundles: vi.fn(async () => [open]),
    });
    vi.mocked(api.prepareCart).mockImplementation(async () => {
      order.push("prepare");
      return [{ id: 11, quantity: 1, properties: { _bundle_instance_id: "i-1" } }];
    });
    vi.mocked(api.addToCart).mockImplementation(async () => {
      order.push("cart");
    });
    vi.mocked(tracker.add).mockImplementation(() => {
      order.push("add-event");
    });
    mountListing(container, [makeCard({ id: open.id })], ctx);

    await userEvent.click(button());
    await flush();
    await userEvent.click(container.querySelector<HTMLButtonElement>(".bc-panel .bc-button")!);
    await flush();
    await flush();
    expect(order).toEqual(["prepare", "cart", "add-event"]);
  });

  it("does not report bundle_add when the cart refuses", async () => {
    const { ctx, api, tracker } = makeContext({ fetchBundles: vi.fn(async () => [open]) });
    vi.mocked(api.addToCart).mockRejectedValue(new Error("nope"));
    mountListing(container, [makeCard({ id: open.id })], ctx);
    await userEvent.click(button());
    await flush();
    await userEvent.click(container.querySelector<HTMLButtonElement>(".bc-panel .bc-button")!);
    await flush();
    await flush();
    expect(tracker.add).not.toHaveBeenCalled();
  });

  it("shows the unavailable message when the bundle vanished since the list loaded", async () => {
    mount([makeCard()], { fetchBundles: vi.fn(async () => []) });
    await userEvent.click(button());
    await flush();
    expect(container.querySelector(".bc-panel .bc-state--error")!.textContent).toContain(
      "currently unavailable",
    );
  });
});

describe("untrusted text", () => {
  it("renders names, descriptions and product titles as text, never as markup", () => {
    const evil = `<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>`;
    mount([
      makeCard({
        name: evil,
        description: evil,
        preview: [{ title: evil, imageUrl: "https://cdn.shopify.com/x.jpg" }],
      }),
    ]);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img[onerror]")).toBeNull();
    expect(card().querySelector("h3")!.textContent).toBe(evil);
    expect(container.querySelector<HTMLImageElement>("img")!.alt).toBe(evil);
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });
});

describe("server helpers behind the cards", () => {
  it("accepts view=listing alone and rejects anything else", () => {
    expect(parseStorefrontQuery(new URLSearchParams("view=listing"))).toEqual({ view: "listing" });
    expect(() => parseStorefrontQuery(new URLSearchParams("view=all"))).toThrow();
    expect(() => parseStorefrontQuery(new URLSearchParams("view=listing&productId=5"))).toThrow();
    expect(() =>
      parseStorefrontQuery(
        new URLSearchParams("view=listing&bundleId=5f0c6a6e-8f0e-4c53-9b64-6f7f3f2b9a11"),
      ),
    ).toThrow();
  });

  it("rolls product states up per bundle type", () => {
    // fixed: every product is required, so the worst state wins.
    expect(bundleAvailability("fixed", ["available", "available"])).toBe("available");
    expect(bundleAvailability("fixed", ["available", "sold_out"])).toBe("sold_out");
    expect(bundleAvailability("fixed", ["sold_out", "unavailable"])).toBe("unavailable");
    expect(bundleAvailability("fixed", ["available", "unknown"])).toBe("unknown");
    // pools: the best state wins.
    expect(bundleAvailability("mix_match", ["sold_out", "available"])).toBe("available");
    expect(bundleAvailability("quantity", ["unavailable", "sold_out"])).toBe("sold_out");
    expect(bundleAvailability("quantity", ["unavailable", "unavailable"])).toBe("unavailable");
    expect(bundleAvailability("mix_match", ["unavailable", "unknown"])).toBe("unknown");
    expect(bundleAvailability("fixed", [])).toBe("unknown");
  });
});
