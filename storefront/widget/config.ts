/**
 * Everything the widget needs comes from data-* attributes the Liquid
 * block renders — public storefront values only (URLs, ids, currency,
 * locale, UI strings). There are no secrets in a theme extension.
 */
export type WidgetMode = "product" | "listing";

export const DEFAULT_STRINGS = {
  loading: "Loading bundle…",
  unavailable: "This bundle is currently unavailable. Please try again later.",
  error: "Something went wrong. Please try again.",
  network: "Couldn't reach the store. Check your connection and try again.",
  retry: "Try again",
  empty: "No bundles are available right now.",
  add: "Add bundle to cart",
  adding: "Adding…",
  added: "Bundle added to your cart.",
  cartFailed: "We couldn't add the bundle to your cart. Please try again.",
  viewCart: "View cart",
  selected: "Selected",
  selectedCount: "Selected: {count} / {total}",
  included: "Included",
  soldOut: "Sold out",
  product: "Product",
  save: "Save {amount}",
  regular: "Regular price",
  youSave: "You save",
  bundlePrice: "Bundle price",
  chooseOption: "Options for {product}",
  increase: "Increase quantity of {product}",
  decrease: "Decrease quantity of {product}",
  viewBundle: "View bundle",
  hideBundle: "Hide bundle",
  products: "{count} products",
  bundleTypeFixed: "Fixed bundle",
  bundleTypeQuantity: "Quantity bundle",
  bundleTypeMixMatch: "Mix & match",
  chooseItems: "Choose items",
  chooseCount: "Choose {count} items",
  moreProducts: "+{count} more",
  previewLabel: "Products in this bundle",
  priceDepends: "Price depends on your selection.",
  discountNote: "The discount is applied at checkout.",
  bundleSoldOut: "Currently sold out",
  bundleUnavailable: "Currently unavailable",
  listingLoading: "Loading bundles…",
};

export type Strings = typeof DEFAULT_STRINGS;

export interface WidgetConfig {
  mode: WidgetMode;
  /** e.g. "/apps/bundlecraft" — the App Proxy path on the merchant's own domain. */
  apiBase: string;
  cartAddUrl: string;
  cartUrl: string;
  productId: string | null;
  bundleId: string | null;
  currency: string;
  locale: string;
  showEmpty: boolean;
  heading: string;
  strings: Strings;
}

export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

function parseStrings(raw: string | undefined): Strings {
  if (!raw) return DEFAULT_STRINGS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_STRINGS;
    const merged: Record<string, string> = { ...DEFAULT_STRINGS };
    for (const [key, value] of Object.entries(parsed)) {
      if (key in DEFAULT_STRINGS && typeof value === "string" && value !== "") merged[key] = value;
    }
    return merged as Strings;
  } catch {
    return DEFAULT_STRINGS;
  }
}

export function readConfig(root: HTMLElement): WidgetConfig {
  const data = root.dataset;
  return {
    mode: data.mode === "listing" ? "listing" : "product",
    apiBase: (data.apiBase ?? "/apps/bundlecraft").replace(/\/+$/, ""),
    cartAddUrl: data.cartAddUrl ?? "/cart/add.js",
    cartUrl: data.cartUrl ?? "/cart",
    productId: data.productId && /^\d+$/.test(data.productId) ? data.productId : null,
    bundleId: data.bundleId ? data.bundleId.trim() || null : null,
    currency: data.currency || "USD",
    locale: data.locale || document.documentElement.lang || "en",
    showEmpty: data.showEmpty === "true",
    heading: (data.heading ?? "").trim(),
    strings: parseStrings(data.strings),
  };
}
