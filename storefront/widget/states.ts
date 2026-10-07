import type { WidgetConfig } from "./config";
import { el } from "./dom";

/** Lightweight loading indicator: text + CSS-only skeleton, no images or libraries. */
export function loadingState(config: WidgetConfig): HTMLElement {
  return el(
    "div",
    { class: "bc-state bc-state--loading", role: "status" },
    el("span", { class: "bc-skeleton", "aria-hidden": "true" }),
    el("span", { class: "bc-state-text" }, config.strings.loading),
  );
}

export function emptyState(config: WidgetConfig): HTMLElement {
  return el("p", { class: "bc-state bc-state--empty", role: "status" }, config.strings.empty);
}

/** `message` is always customer-friendly text from a WidgetError, never raw server detail. */
export function errorState(
  config: WidgetConfig,
  message: string,
  onRetry?: () => void,
): HTMLElement {
  const box = el("div", { class: "bc-state bc-state--error", role: "alert" }, el("p", {}, message));
  if (onRetry) {
    const retry = el(
      "button",
      { type: "button", class: "bc-button bc-button--secondary" },
      config.strings.retry,
    );
    retry.addEventListener("click", onRetry);
    box.append(retry);
  }
  return box;
}

/**
 * Landing page loading state: placeholder cards so the layout does not jump when the real
 * ones arrive. The placeholders are decorative; one status message tells assistive tech.
 */
export function listingSkeleton(config: WidgetConfig, count = 3): HTMLElement {
  const cards = Array.from({ length: count }, () =>
    el(
      "li",
      { class: "bc-listing-item", "aria-hidden": "true" },
      el(
        "div",
        { class: "bc-bundle-card bc-placeholder" },
        el("div", { class: "bc-placeholder-media" }),
        el("div", { class: "bc-placeholder-line" }),
        el("div", { class: "bc-placeholder-line bc-placeholder-line--short" }),
      ),
    ),
  );
  return el(
    "div",
    { class: "bc-state-block" },
    el("p", { class: "bc-sr-only", role: "status" }, config.strings.listingLoading),
    el("ul", { class: "bc-listing" }, ...cards),
  );
}
