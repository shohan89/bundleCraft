import { DEFAULT_CUSTOMIZATION } from "@/lib/customization/defaults";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackedEvent } from "@/lib/storefront/types";
import { createTracker } from "./analytics";
import { WidgetError } from "./api";
import { mountBundle } from "./bundle";
import { flush, makeBundle, makeContext, product, variant } from "./testing";

let container: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  container = document.createElement("div");
  document.body.append(container);
});

const button = () => container.querySelector<HTMLButtonElement>(".bc-button")!;
const hint = () => container.querySelector(".bc-hint")!.textContent;
const feedback = () => container.querySelector(".bc-feedback")!.textContent;

describe("rendering", () => {
  it("renders the name, discount badge, products and prices, and reports one view", () => {
    const { ctx, tracker } = makeContext();
    mountBundle(container, makeBundle({ description: "Three pieces, one look." }), ctx);

    expect(container.querySelector(".bc-title")!.textContent).toBe("Complete Look");
    expect(container.querySelector(".bc-badge")!.textContent).toBe("Save 20%");
    expect(container.querySelector(".bc-description")!.textContent).toBe("Three pieces, one look.");
    expect(container.querySelectorAll(".bc-card")).toHaveLength(3);
    expect(container.querySelector(".bc-price")!.textContent).toBe("$20.00");
    expect(tracker.view).toHaveBeenCalledExactlyOnceWith("5f0c6a6e-8f0e-4c53-9b64-6f7f3f2b9a11");
  });

  it("formats a fixed-amount discount as money", () => {
    const { ctx } = makeContext();
    mountBundle(container, makeBundle({ discount: { type: "fixed_amount", value: 30 } }), ctx);
    expect(container.querySelector(".bc-badge")!.textContent).toBe("Save $30.00");
  });

  it("shows the price preview for a complete selection: regular, savings, bundle price", () => {
    const { ctx } = makeContext();
    mountBundle(container, makeBundle(), ctx); // 3 x $20 at 20% off
    const text = container.querySelector(".bc-prices")!.textContent;
    expect(text).toContain("$60.00");
    expect(text).toContain("$12.00"); // you save
    expect(text).toContain("$48.00"); // bundle price
  });

  it("shows no price figures when Shopify prices are unknown, rather than guessing", () => {
    const { ctx } = makeContext();
    const products = [product("11", { variants: [] }), product("21", { variants: [] })];
    mountBundle(container, makeBundle({ products }), ctx);
    expect(container.querySelector<HTMLElement>(".bc-prices")!.hidden).toBe(true);
  });

  it("renders product and bundle text as text, never as HTML", () => {
    const { ctx } = makeContext();
    mountBundle(
      container,
      makeBundle({
        name: "<img src=x onerror=alert(1)>",
        products: [product("11", { title: "<script>alert(1)</script>" })],
      }),
      ctx,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".bc-title")!.textContent).toBe("<img src=x onerror=alert(1)>");
  });

  it("only uses https or relative image URLs", () => {
    const { ctx } = makeContext();
    mountBundle(
      container,
      makeBundle({
        products: [
          product("11", { imageUrl: "https://cdn.shopify.com/a.png" }),
          product("21", { imageUrl: "javascript:alert(1)" }),
        ],
      }),
      ctx,
    );
    const images = [...container.querySelectorAll("img")];
    expect(images).toHaveLength(1);
    // Shopify CDN photos are requested at card size, not full size.
    expect(images[0].getAttribute("src")).toBe("https://cdn.shopify.com/a.png?width=400");
    expect(images[0].getAttribute("decoding")).toBe("async");
    expect(images[0].getAttribute("alt")).toBe("Product 11");
    expect(images[0].getAttribute("loading")).toBe("lazy");
  });

  it("applies the merchant's saved customization via CSS variables and layout", () => {
    for (const layout of ["card", "horizontal", "vertical"] as const) {
      document.body.replaceChildren((container = document.createElement("div")));
      const { ctx } = makeContext();
      mountBundle(
        container,
        makeBundle({
          customization: {
            ...DEFAULT_CUSTOMIZATION,
            layout,
            colors: {
              ...DEFAULT_CUSTOMIZATION.colors,
              primary: "#112233",
              button: "#445566",
              background: "#ffeecc",
            },
            typography: { ...DEFAULT_CUSTOMIZATION.typography, fontSize: 20 },
          },
        }),
        ctx,
      );
      const root = container.querySelector<HTMLElement>(".bc-widget")!;
      expect(root.dataset.layout).toBe(layout);
      expect(root.style.getPropertyValue("--bc-primary")).toBe("#112233");
      expect(root.style.getPropertyValue("--bc-button")).toBe("#445566");
      expect(root.style.getPropertyValue("--bc-bg")).toBe("#ffeecc");
      expect(root.style.getPropertyValue("--bc-font-size")).toBe("20px");
    }
  });

  it("ignores a malformed color instead of applying it", () => {
    const { ctx } = makeContext();
    mountBundle(
      container,
      makeBundle({
        customization: {
          layout: "card",
          colors: {
            ...DEFAULT_CUSTOMIZATION.colors,
            primary: "red;background:url(x)",
            button: "#000000",
            background: "#ffffff",
          },
          typography: { ...DEFAULT_CUSTOMIZATION.typography, fontSize: 16 },
          card: DEFAULT_CUSTOMIZATION.card,
          button: DEFAULT_CUSTOMIZATION.button,
          spacing: DEFAULT_CUSTOMIZATION.spacing,
        },
      }),
      ctx,
    );
    // The malformed value is dropped and this one field takes its default; nothing else changes.
    const root = container.querySelector<HTMLElement>(".bc-widget")!;
    expect(root.style.getPropertyValue("--bc-primary")).toBe(DEFAULT_CUSTOMIZATION.colors.primary);
    expect(root.outerHTML).not.toContain("url(x)");
  });
});

describe("fixed bundle", () => {
  it("lists every included product with no selection controls, ready to add", () => {
    const { ctx } = makeContext();
    mountBundle(
      container,
      makeBundle({ products: [product("11"), product("21", { quantity: 2 })] }),
      ctx,
    );

    expect(container.querySelectorAll("input, .bc-stepper")).toHaveLength(0);
    expect([...container.querySelectorAll(".bc-included")].map((n) => n.textContent)).toEqual([
      "Included",
      "Included × 2",
    ]);
    expect(button().disabled).toBe(false);
  });

  it("adds every product to the cart with bundle metadata, then shows success and a cart link", async () => {
    const { ctx, api, tracker } = makeContext();
    const added = vi.fn();
    mountBundle(container, makeBundle(), ctx);
    container.addEventListener("bundlecraft:added", added);

    await userEvent.click(button());
    await flush();

    expect(api.prepareCart).toHaveBeenCalledWith("5f0c6a6e-8f0e-4c53-9b64-6f7f3f2b9a11", [
      { key: "11", variantId: "11", quantity: 1 },
      { key: "21", variantId: "21", quantity: 1 },
      { key: "31", variantId: "31", quantity: 1 },
    ]);
    const lines = vi.mocked(api.addToCart).mock.calls[0][0];
    expect(lines.map((l) => l.id)).toEqual([11, 21, 31]);
    expect(lines[0].properties).toMatchObject({
      _bundle_id: "5f0c6a6e-8f0e-4c53-9b64-6f7f3f2b9a11",
      _bundle_instance_id: "instance-1",
    });
    expect(feedback()).toContain("Bundle added to your cart.");
    expect(container.querySelector(".bc-cart-link")!.getAttribute("href")).toBe("/cart");
    expect(tracker.add).toHaveBeenCalledExactlyOnceWith(
      "5f0c6a6e-8f0e-4c53-9b64-6f7f3f2b9a11",
      "instance-1",
    );
    expect(added).toHaveBeenCalledOnce();
  });

  it("shows a busy state while adding and prevents a double submit", async () => {
    let finish: () => void = () => {};
    const { ctx, api } = makeContext({
      addToCart: vi.fn(() => new Promise<void>((resolve) => (finish = resolve))),
    });
    mountBundle(container, makeBundle(), ctx);

    await userEvent.click(button());
    await flush();
    expect(button().textContent).toBe("Adding…");
    expect(button().disabled).toBe(true);
    expect(container.querySelector(".bc-widget")!.getAttribute("aria-busy")).toBe("true");

    button().click(); // ignored while busy
    finish();
    await flush();
    expect(api.prepareCart).toHaveBeenCalledOnce();
    expect(button().textContent).toBe("Add bundle to cart");
    expect(container.querySelector(".bc-widget")!.hasAttribute("aria-busy")).toBe(false);
  });

  it("blocks adding when a product is sold out", () => {
    const { ctx } = makeContext();
    mountBundle(
      container,
      makeBundle({
        products: [product("11", { variants: [variant("11", "S", { available: false })] })],
      }),
      ctx,
    );
    expect(button().disabled).toBe(true);
    expect(hint()).toBe("Sold out");
  });
});

describe("variant selection", () => {
  const withVariants = () =>
    makeBundle({
      products: [
        product("11", {
          title: "Tee",
          variants: [
            variant("11", "S"),
            variant("12", "M"),
            variant("13", "L", { available: false }),
          ],
        }),
        product("21"),
      ],
    });

  it("offers a labelled picker only for products with several variants, hiding sold-out extras", () => {
    const { ctx } = makeContext();
    mountBundle(container, withVariants(), ctx);

    const select = container.querySelector<HTMLSelectElement>("select")!;
    expect(container.querySelectorAll("select")).toHaveLength(1);
    expect([...select.options].map((o) => o.textContent)).toEqual(["S", "M"]); // "L" is sold out
    expect(select.value).toBe("11");
    expect(container.querySelector(`label[for="${select.id}"]`)!.textContent).toBe(
      "Options for Tee",
    );
  });

  it("sends the chosen variant, and updates the price, when adding to the cart", async () => {
    const { ctx, api } = makeContext();
    const bundle = withVariants();
    bundle.products[0].variants[1] = variant("12", "M", { price: "30.00" });
    mountBundle(container, bundle, ctx);

    const select = container.querySelector<HTMLSelectElement>("select")!;
    await userEvent.selectOptions(select, "12");
    expect(container.querySelector(".bc-price")!.textContent).toBe("$30.00");

    await userEvent.click(button());
    await flush();

    expect(vi.mocked(api.prepareCart).mock.calls[0][1][0]).toEqual({
      key: "11",
      variantId: "12",
      quantity: 1,
    });
    expect(vi.mocked(api.addToCart).mock.calls[0][0][0].id).toBe(12); // the M, not the configured S
  });
});

describe("quantity bundle", () => {
  const quantityBundle = () =>
    makeBundle({ type: "quantity", requiredQuantity: 3, products: [product("11"), product("21")] });
  const plus = (index: number) =>
    container.querySelectorAll<HTMLButtonElement>(".bc-step[aria-label^='Increase']")[index];
  const minus = (index: number) =>
    container.querySelectorAll<HTMLButtonElement>(".bc-step[aria-label^='Decrease']")[index];

  it("starts with nothing selected, shows the count, and blocks adding", () => {
    const { ctx } = makeContext();
    mountBundle(container, quantityBundle(), ctx);
    expect(container.querySelector(".bc-progress")!.textContent).toBe("Selected: 0 / 3");
    expect(hint()).toBe("Choose 3 more items.");
    expect(button().disabled).toBe(true);
    expect(minus(0).disabled).toBe(true);
  });

  it("blocks under-selection, then enables exactly at the required quantity", async () => {
    const { ctx } = makeContext();
    mountBundle(container, quantityBundle(), ctx);

    await userEvent.click(plus(0));
    await userEvent.click(plus(0));
    expect(container.querySelector(".bc-progress")!.textContent).toBe("Selected: 2 / 3");
    expect(hint()).toBe("Choose 1 more item.");
    expect(button().disabled).toBe(true);

    await userEvent.click(plus(1));
    expect(container.querySelector(".bc-progress")!.textContent).toBe("Selected: 3 / 3");
    expect(hint()).toBe("");
    expect(button().disabled).toBe(false);
  });

  it("prevents over-selection and lets the customer reduce again", async () => {
    const { ctx } = makeContext();
    mountBundle(container, quantityBundle(), ctx);
    await userEvent.click(plus(0));
    await userEvent.click(plus(0));
    await userEvent.click(plus(1));

    expect(plus(0).disabled).toBe(true);
    expect(plus(1).disabled).toBe(true);
    await userEvent.click(minus(0));
    expect(plus(1).disabled).toBe(false);
    expect(button().disabled).toBe(true);
  });

  it("adds the chosen quantities to the cart", async () => {
    const { ctx, api } = makeContext();
    mountBundle(container, quantityBundle(), ctx);
    await userEvent.click(plus(0));
    await userEvent.click(plus(0));
    await userEvent.click(plus(1));

    await userEvent.click(button());
    await flush();

    expect(api.prepareCart).toHaveBeenCalledWith(expect.any(String), [
      { key: "11", variantId: "11", quantity: 2 },
      { key: "21", variantId: "21", quantity: 1 },
    ]);
  });

  it("gives every stepper button an accessible name", () => {
    const { ctx } = makeContext();
    mountBundle(container, quantityBundle(), ctx);
    expect(plus(0).getAttribute("aria-label")).toBe("Increase quantity of Product 11");
    expect(minus(1).getAttribute("aria-label")).toBe("Decrease quantity of Product 21");
  });
});

describe("mix & match bundle", () => {
  const mixBundle = () =>
    makeBundle({
      type: "mix_match",
      requiredQuantity: 2,
      products: [product("11"), product("21"), product("31")],
    });
  const boxes = () => [...container.querySelectorAll<HTMLInputElement>(".bc-checkbox")];

  it("lets the customer pick products, with a visible (not colour-only) selected state", async () => {
    const { ctx } = makeContext();
    mountBundle(container, mixBundle(), ctx);

    await userEvent.click(boxes()[0]);
    expect(boxes()[0].checked).toBe(true);
    expect(container.querySelector(".bc-card")!.getAttribute("data-selected")).toBe("true");
    expect(container.querySelector(".bc-check")!.textContent).toBe("Selected");
    expect(container.querySelector(".bc-progress")!.textContent).toBe("Selected: 1 / 2");
    expect(button().disabled).toBe(true);
  });

  it("enforces the required count: unselected products lock at the limit and unlock on deselect", async () => {
    const { ctx } = makeContext();
    mountBundle(container, mixBundle(), ctx);

    await userEvent.click(boxes()[0]);
    await userEvent.click(boxes()[1]);
    expect(boxes()[2].disabled).toBe(true);
    expect(button().disabled).toBe(false);

    await userEvent.click(boxes()[0]);
    expect(boxes()[2].disabled).toBe(false);
    expect(button().disabled).toBe(true);
  });

  it("adds only the selected products", async () => {
    const { ctx, api } = makeContext();
    mountBundle(container, mixBundle(), ctx);
    await userEvent.click(boxes()[0]);
    await userEvent.click(boxes()[2]);

    await userEvent.click(button());
    await flush();

    expect(api.prepareCart).toHaveBeenCalledWith(expect.any(String), [
      { key: "11", variantId: "11", quantity: 1 },
      { key: "31", variantId: "31", quantity: 1 },
    ]);
  });

  it("can't select a sold-out product", () => {
    const { ctx } = makeContext();
    const bundle = mixBundle();
    bundle.products[1] = product("21", { variants: [variant("21", "S", { available: false })] });
    mountBundle(container, bundle, ctx);
    expect(boxes()[1].disabled).toBe(true);
    expect(container.querySelectorAll(".bc-soldout:not([hidden])")).toHaveLength(1);
  });
});

describe("error handling", () => {
  it("shows a friendly message and re-enables the button when the cart rejects the add, and reports no add event", async () => {
    const { ctx, tracker } = makeContext({
      addToCart: vi.fn(async () => {
        throw new WidgetError("All 5 Tee are in your cart.", "CART");
      }),
    });
    mountBundle(container, makeBundle(), ctx);

    await userEvent.click(button());
    await flush();

    expect(feedback()).toBe("All 5 Tee are in your cart.");
    expect(button().disabled).toBe(false);
    expect(tracker.add).not.toHaveBeenCalled();
    expect(container.querySelector(".bc-cart-link")).toBeNull();
  });

  it("shows the server's customer-friendly validation message and does not touch the cart", async () => {
    const { ctx, api } = makeContext({
      prepareCart: vi.fn(async () => {
        throw new WidgetError("Sorry, one of those items is out of stock.", "INVALID_SELECTION");
      }),
    });
    mountBundle(container, makeBundle(), ctx);

    await userEvent.click(button());
    await flush();

    expect(feedback()).toBe("Sorry, one of those items is out of stock.");
    expect(api.addToCart).not.toHaveBeenCalled();
  });

  it("falls back to a generic message for unexpected failures (no raw error text)", async () => {
    const { ctx } = makeContext({
      addToCart: vi.fn(async () => {
        throw new TypeError("Cannot read properties of undefined (reading 'x')");
      }),
    });
    mountBundle(container, makeBundle(), ctx);

    await userEvent.click(button());
    await flush();

    expect(feedback()).toBe("We couldn't add the bundle to your cart. Please try again.");
    expect(container.textContent).not.toContain("Cannot read properties");
  });
});

describe("accessibility", () => {
  it("labels the widget region, keeps status messages in live regions, and uses real form controls", () => {
    const { ctx } = makeContext();
    mountBundle(container, makeBundle({ type: "mix_match", requiredQuantity: 2 }), ctx);

    expect(container.querySelector("section")!.getAttribute("aria-label")).toBe("Complete Look");
    expect(container.querySelector(".bc-hint")!.getAttribute("aria-live")).toBe("polite");
    expect(container.querySelector(".bc-feedback")!.getAttribute("aria-live")).toBe("polite");
    for (const box of container.querySelectorAll(".bc-checkbox")) {
      expect(container.querySelector(`label[for="${box.id}"]`)).not.toBeNull();
    }
  });

  it("supports keyboard operation of the mix & match checkboxes", async () => {
    const { ctx } = makeContext();
    mountBundle(container, makeBundle({ type: "mix_match", requiredQuantity: 2 }), ctx);
    const first = container.querySelector<HTMLInputElement>(".bc-checkbox")!;
    first.focus();
    await userEvent.keyboard(" ");
    expect(first.checked).toBe(true);
  });
});

describe("analytics events", () => {
  it("sends exactly one bundle_view (with an idempotency id) however often the widget is remounted in place", async () => {
    const send = vi.fn<(event: TrackedEvent) => Promise<void>>(async () => {});
    const { ctx } = makeContext();
    ctx.tracker = createTracker(send);
    mountBundle(container, makeBundle(), ctx);
    mountBundle(container, makeBundle(), ctx);
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({
      bundleId: "5f0c6a6e-8f0e-4c53-9b64-6f7f3f2b9a11",
      event: "bundle_view",
      eventId: expect.any(String),
    });
  });

  it("sends bundle_add with the cart instance id only after a successful cart add", async () => {
    const send = vi.fn<(event: TrackedEvent) => Promise<void>>(async () => {});
    const { ctx } = makeContext();
    ctx.tracker = createTracker(send);
    mountBundle(container, makeBundle(), ctx);
    send.mockClear();

    await userEvent.click(button());
    await flush();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ event: "bundle_add", instanceId: "instance-1" });
  });

  it("sends no bundle_add when the cart add fails", async () => {
    const send = vi.fn<(event: TrackedEvent) => Promise<void>>(async () => {});
    const { ctx } = makeContext({
      addToCart: vi.fn(async () => {
        throw new WidgetError("Sold out.", "CART");
      }),
    });
    ctx.tracker = createTracker(send);
    mountBundle(container, makeBundle(), ctx);
    send.mockClear();

    await userEvent.click(button());
    await flush();

    expect(send).not.toHaveBeenCalled();
  });

  it("a failing analytics request never breaks the customer's add to cart", async () => {
    const { ctx } = makeContext();
    ctx.tracker = createTracker(async () => {
      throw new Error("analytics is down");
    });
    mountBundle(container, makeBundle(), ctx);

    await userEvent.click(button());
    await flush();

    expect(feedback()).toContain("Bundle added to your cart.");
    expect(container.querySelector(".bc-cart-link")).not.toBeNull();
    expect(button().disabled).toBe(false);
  });
});
