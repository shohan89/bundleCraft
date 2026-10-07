/** Test helpers shared by the widget tests. Not part of the shipped bundle (nothing imports it). */
import { vi } from "vitest";
import { cloneDefaultCustomization } from "@/lib/customization/defaults";
import { buildCartLines } from "@/lib/storefront/cart";
import type {
  StorefrontBundle,
  StorefrontBundleCard,
  StorefrontProduct,
  StorefrontVariant,
} from "@/lib/storefront/types";
import type { WidgetApi } from "./api";
import type { Tracker } from "./analytics";
import { readConfig, type WidgetConfig } from "./config";
import type { WidgetContext } from "./bundle";

export function makeConfig(attributes: Record<string, string> = {}): WidgetConfig {
  const root = document.createElement("div");
  root.setAttribute("data-bundlecraft-widget", "");
  root.dataset.currency = "USD";
  root.dataset.locale = "en-US";
  root.dataset.cartUrl = "/cart";
  for (const [key, value] of Object.entries(attributes)) root.dataset[key] = value;
  return readConfig(root);
}

export const variant = (
  id: string,
  title = "Default",
  over: Partial<StorefrontVariant> = {},
): StorefrontVariant => ({
  id,
  title,
  price: "20.00",
  available: true,
  ...over,
});

export function product(id: string, over: Partial<StorefrontProduct> = {}): StorefrontProduct {
  return {
    key: id,
    productId: `p${id}`,
    variantId: id,
    quantity: 1,
    title: `Product ${id}`,
    imageUrl: null,
    variants: [variant(id)],
    ...over,
  };
}

export function makeBundle(over: Partial<StorefrontBundle> = {}): StorefrontBundle {
  const products = over.products ?? [product("11"), product("21"), product("31")];
  return {
    id: "5f0c6a6e-8f0e-4c53-9b64-6f7f3f2b9a11",
    name: "Complete Look",
    description: null,
    type: "fixed",
    requiredQuantity: null,
    discount: { type: "percentage", value: 20 },
    customization: cloneDefaultCustomization(),
    productCount: products.length,
    products,
    ...over,
  };
}

/** A landing-page card as the listing endpoint returns it. */
export function makeCard(over: Partial<StorefrontBundleCard> = {}): StorefrontBundleCard {
  return {
    id: "5f0c6a6e-8f0e-4c53-9b64-6f7f3f2b9a11",
    name: "Complete Look",
    description: null,
    type: "fixed",
    requiredQuantity: null,
    discount: { type: "percentage", value: 20 },
    productCount: 3,
    preview: [
      { title: "Product 11", imageUrl: null },
      { title: "Product 21", imageUrl: null },
      { title: "Product 31", imageUrl: null },
    ],
    pricing: { subtotal: 60, total: 48, savings: 12 },
    availability: "available",
    customization: cloneDefaultCustomization(),
    ...over,
  };
}

export function makeContext(overrides: Partial<WidgetApi> = {}, config = makeConfig()) {
  const api: WidgetApi = {
    fetchBundles: vi.fn(async () => []),
    fetchListing: vi.fn(async () => []),
    prepareCart: vi.fn(async (bundleId, selection) =>
      buildCartLines(
        { id: bundleId, name: "Complete Look", type: "fixed" },
        selection,
        "instance-1",
      ),
    ),
    addToCart: vi.fn(async () => {}),
    sendEvent: vi.fn(async () => {}),
    ...overrides,
  };
  const tracker: Tracker = { view: vi.fn(), add: vi.fn() };
  const ctx: WidgetContext = { config, api, tracker };
  return { ctx, api, tracker };
}

/** Yields to pending promises (button handlers are async). */
export const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
