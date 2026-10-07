import type {
  BundleSelectionItem,
  CartLineItem,
  StorefrontBundle,
  StorefrontBundleCard,
  TrackedEvent,
} from "@/lib/storefront/types";
import type { Strings, WidgetConfig } from "./config";

export class WidgetError extends Error {
  constructor(
    /** Always customer-friendly. */
    message: string,
    readonly code: "NETWORK" | "UNAVAILABLE" | "INVALID_SELECTION" | "CART" | "ERROR",
  ) {
    super(message);
    this.name = "WidgetError";
  }
}

interface Envelope<T> {
  success?: boolean;
  data?: T;
  error?: { message?: unknown };
}

export interface WidgetApi {
  fetchBundles(query: {
    bundleId?: string | null;
    productId?: string | null;
  }): Promise<StorefrontBundle[]>;
  /** Landing-page cards: the light projection of every active bundle. */
  fetchListing(): Promise<StorefrontBundleCard[]>;
  prepareCart(bundleId: string, selection: BundleSelectionItem[]): Promise<CartLineItem[]>;
  addToCart(items: CartLineItem[]): Promise<void>;
  sendEvent(event: TrackedEvent): Promise<void>;
}

/**
 * All network access for the widget. Failures become WidgetErrors with
 * customer-friendly text; raw server/Shopify detail is never surfaced.
 */
export function createApi(
  config: Pick<WidgetConfig, "apiBase" | "cartAddUrl">,
  strings: Strings,
  doFetch: typeof fetch = (input, init) => fetch(input, init),
): WidgetApi {
  // One request per distinct URL per page, shared by every widget on it.
  const inflight = new Map<string, Promise<StorefrontBundle[]>>();
  let listingRequest: Promise<StorefrontBundleCard[]> | null = null;

  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await doFetch(`${config.apiBase}${path}`, {
        credentials: "same-origin",
        ...init,
        headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      });
    } catch {
      throw new WidgetError(strings.network, "NETWORK");
    }

    let body: Envelope<T> | null = null;
    try {
      body = (await response.json()) as Envelope<T>;
    } catch {
      body = null;
    }

    if (response.ok && body?.success && body.data !== undefined) return body.data;
    if (response.status === 404) throw new WidgetError(strings.unavailable, "UNAVAILABLE");
    if (response.status === 422 && typeof body?.error?.message === "string") {
      throw new WidgetError(body.error.message, "INVALID_SELECTION");
    }
    throw new WidgetError(strings.error, "ERROR");
  }

  return {
    fetchBundles({ bundleId, productId }) {
      const params = new URLSearchParams();
      if (bundleId) params.set("bundleId", bundleId);
      else if (productId) params.set("productId", productId);
      const query = params.toString();
      const path = `/bundles${query ? `?${query}` : ""}`;

      const existing = inflight.get(path);
      if (existing) return existing;

      const request = call<{ bundles: StorefrontBundle[] }>(path).then((data) => data.bundles);
      inflight.set(path, request);
      // A failed request must be retryable, not cached forever.
      request.catch(() => inflight.delete(path));
      return request;
    },

    fetchListing() {
      if (listingRequest) return listingRequest;
      const request = call<{ bundles: StorefrontBundleCard[] }>("/bundles?view=listing").then(
        (data) => data.bundles,
      );
      listingRequest = request;
      // Retry must hit the network again, not replay the failure.
      request.catch(() => {
        listingRequest = null;
      });
      return request;
    },

    async prepareCart(bundleId, selection) {
      const data = await call<{ items: CartLineItem[] }>("/cart", {
        method: "POST",
        body: JSON.stringify({ bundleId, selection }),
      });
      return data.items;
    },

    async addToCart(items) {
      let response: Response;
      try {
        response = await doFetch(config.cartAddUrl, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ items }),
        });
      } catch {
        throw new WidgetError(strings.network, "NETWORK");
      }
      if (!response.ok) {
        // Shopify's cart errors ("all 5 are in your cart") are shopper-facing already.
        let description: unknown = null;
        try {
          description = ((await response.json()) as { description?: unknown }).description;
        } catch {
          description = null;
        }
        throw new WidgetError(
          typeof description === "string" && description ? description : strings.cartFailed,
          "CART",
        );
      }
    },

    async sendEvent(event) {
      await call("/events", {
        method: "POST",
        keepalive: true,
        body: JSON.stringify(event),
      });
    },
  };
}
