import { createApi, WidgetError } from "./api";
import { createTracker } from "./analytics";
import { mountBundle, type WidgetContext } from "./bundle";
import { readConfig } from "./config";
import { el } from "./dom";
import { mountListing } from "./listing";
import { emptyState, errorState, listingSkeleton, loadingState } from "./states";

/**
 * Entry point of the theme extension's JavaScript. Scans for the blocks
 * the Liquid renders ([data-bundlecraft-widget]) and brings each to life
 * when it nears the viewport, so a product page pays nothing for widgets
 * that are never scrolled to.
 */

// One api + tracker per distinct endpoint: widgets on the same page share
// requests and never report the same bundle view twice.
const contexts = new Map<string, Pick<WidgetContext, "api" | "tracker">>();

function contextFor(root: HTMLElement): WidgetContext {
  const config = readConfig(root);
  const key = `${config.apiBase}|${config.cartAddUrl}`;
  let shared = contexts.get(key);
  if (!shared) {
    const api = createApi(config, config.strings);
    shared = { api, tracker: createTracker(api.sendEvent) };
    contexts.set(key, shared);
  }
  return { config, ...shared };
}

async function render(root: HTMLElement): Promise<void> {
  const ctx = contextFor(root);
  const { config, api } = ctx;
  const listing = config.mode === "listing" || (!config.bundleId && !config.productId);

  root.setAttribute("aria-busy", "true");
  root.replaceChildren(listing ? listingSkeleton(config) : loadingState(config));

  try {
    const heading = config.heading ? [el("h2", { class: "bc-heading" }, config.heading)] : [];
    if (listing) {
      const cards = await api.fetchListing();
      if (cards.length === 0) {
        // The landing page always says something; an empty product-page block shows nothing.
        root.replaceChildren(...heading, emptyState(config));
        return;
      }
      const holder = document.createElement("div");
      mountListing(holder, cards, ctx);
      root.replaceChildren(...heading, holder);
      return;
    }

    const bundles = await api.fetchBundles({
      bundleId: config.bundleId,
      productId: config.productId,
    });
    if (bundles.length === 0) {
      if (config.showEmpty) root.replaceChildren(emptyState(config));
      else root.hidden = true; // a product with no bundles shows nothing
      return;
    }
    root.replaceChildren(
      ...heading,
      ...bundles.map((bundle) => {
        const holder = document.createElement("div");
        mountBundle(holder, bundle, ctx);
        return holder;
      }),
    );
  } catch (error) {
    if (error instanceof WidgetError && error.code === "UNAVAILABLE" && !config.showEmpty) {
      root.hidden = true;
      return;
    }
    root.replaceChildren(
      errorState(
        config,
        error instanceof WidgetError ? error.message : config.strings.error,
        () => void render(root),
      ),
    );
  } finally {
    root.removeAttribute("aria-busy");
  }
}

function start(root: HTMLElement): void {
  if (root.dataset.bcInit) return;
  root.dataset.bcInit = "1";

  if (typeof IntersectionObserver === "undefined") {
    void render(root);
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        void render(root);
      }
    },
    { rootMargin: "200px" },
  );
  observer.observe(root);
}

export function init(scope: ParentNode = document): void {
  scope.querySelectorAll<HTMLElement>("[data-bundlecraft-widget]").forEach(start);
}

declare global {
  interface Window {
    BundleCraft?: { init: typeof init };
  }
}

// Theme editors add blocks after load; expose init() so they can be started.
window.BundleCraft = { init };
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => init());
} else {
  init();
}
