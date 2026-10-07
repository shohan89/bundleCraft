import { PREVIEW_LIMIT, type StorefrontBundleCard } from "@/lib/storefront/types";
import { WidgetError } from "./api";
import { mountBundle, type WidgetContext } from "./bundle";
import { applyTheme } from "@/lib/customization/theme";
import { format, type Strings } from "./config";
import { el, formatMoney, safeImageUrl, sizedImageUrl } from "./dom";
import { errorState, loadingState } from "./states";

const PREVIEW_IMAGE_WIDTH = 240;

/**
 * Bundle landing page: a grid of cards for every active bundle. Each card shows what the
 * customer needs to decide (products, price or discount, availability); "View bundle" then
 * opens the full interactive widget in place. That widget is loaded on demand, so the
 * listing stays cheap, and it is the ONLY place that selects products, talks to the cart or
 * reports analytics. No new URLs, so nothing can clash with /collections/bundles or the
 * theme's own routes.
 *
 * Everything from the server goes in as text nodes or checked attributes, never as HTML.
 */
export function mountListing(
  container: HTMLElement,
  bundles: StorefrontBundleCard[],
  ctx: WidgetContext,
): void {
  const list = el("ul", { class: "bc-listing" });
  bundles.forEach((bundle, index) => list.append(renderCard(bundle, index, ctx)));
  container.replaceChildren(list);
}

function typeLabel(bundle: StorefrontBundleCard, t: Strings): string {
  const label = {
    fixed: t.bundleTypeFixed,
    quantity: t.bundleTypeQuantity,
    mix_match: t.bundleTypeMixMatch,
  }[bundle.type];
  const parts = [label, format(t.products, { count: bundle.productCount })];
  if (bundle.type !== "fixed" && bundle.requiredQuantity) {
    parts.push(format(t.chooseCount, { count: bundle.requiredQuantity }));
  }
  return parts.join(" · ");
}

function previews(bundle: StorefrontBundleCard, ctx: WidgetContext): HTMLElement | null {
  if (bundle.preview.length === 0) return null;
  const t = ctx.config.strings;
  const items = bundle.preview.map((item) => {
    const url = safeImageUrl(item.imageUrl);
    return el(
      "li",
      { class: "bc-preview-item" },
      url
        ? el("img", {
            class: "bc-preview-image",
            src: sizedImageUrl(url, PREVIEW_IMAGE_WIDTH),
            alt: item.title ?? "",
            loading: "lazy",
            decoding: "async",
            width: 120,
            height: 120,
          })
        : el("span", {
            class: "bc-preview-image bc-image--empty",
            role: "img",
            "aria-label": item.title ?? t.product,
          }),
    );
  });
  // Lines can share a product (two variants of one), so only a full preview can hide more.
  const hidden = bundle.productCount - bundle.preview.length;
  if (bundle.preview.length >= PREVIEW_LIMIT && hidden > 0) {
    items.push(
      el(
        "li",
        { class: "bc-preview-item bc-preview-more" },
        format(t.moreProducts, { count: hidden }),
      ),
    );
  }
  return el("ul", { class: "bc-previews", "aria-label": t.previewLabel }, ...items);
}

function pricing(bundle: StorefrontBundleCard, ctx: WidgetContext): HTMLElement {
  const { config } = ctx;
  const t = config.strings;
  const money = (amount: number) => formatMoney(amount, config.currency, config.locale);
  const discount =
    bundle.discount.type === "percentage"
      ? `${bundle.discount.value}%`
      : money(bundle.discount.value);

  const box = el(
    "div",
    { class: "bc-pricing" },
    el("span", { class: "bc-badge" }, format(t.save, { amount: discount })),
  );

  if (bundle.pricing) {
    const { subtotal, total, savings } = bundle.pricing;
    const price = el(
      "p",
      { class: "bc-price" },
      el("span", { class: "bc-sr-only" }, `${t.bundlePrice}: `),
      el("strong", { class: "bc-price-now" }, money(total)),
    );
    if (savings > 0) {
      price.append(
        " ",
        el("span", { class: "bc-sr-only" }, `${t.regular}: `),
        el("s", { class: "bc-price-was" }, money(subtotal)),
      );
    }
    box.append(price);
  } else {
    box.append(el("p", { class: "bc-note" }, t.priceDepends));
  }
  // The card price is a preview; Shopify's checkout has the last word.
  box.append(el("p", { class: "bc-note" }, t.discountNote));
  return box;
}

function renderCard(bundle: StorefrontBundleCard, index: number, ctx: WidgetContext): HTMLElement {
  const { config, api } = ctx;
  const t = config.strings;
  const uid = `bc-${index}-${bundle.id.slice(0, 8)}`;
  const panelId = `${uid}-panel`;
  const titleId = `${uid}-title`;

  const buyable = bundle.availability === "available" || bundle.availability === "unknown";
  const viewLabel = bundle.type === "fixed" ? t.viewBundle : t.chooseItems;

  const panel = el("div", { class: "bc-panel", id: panelId, hidden: true });
  const toggle = el(
    "button",
    {
      type: "button",
      class: "bc-button",
      "aria-expanded": "false",
      "aria-controls": panelId,
      disabled: !buyable,
    },
    viewLabel,
  );

  let loaded = false;
  const load = async () => {
    panel.replaceChildren(loadingState(config));
    try {
      const [full] = await api.fetchBundles({ bundleId: bundle.id });
      if (!full) throw new WidgetError(t.unavailable, "UNAVAILABLE");
      loaded = true;
      mountBundle(panel, full, ctx);
    } catch (error) {
      panel.replaceChildren(
        errorState(
          config,
          error instanceof WidgetError ? error.message : t.error,
          () => void load(),
        ),
      );
    }
  };

  const item = el("li", { class: "bc-listing-item" });
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? t.hideBundle : viewLabel;
    panel.hidden = !open;
    item.classList.toggle("bc-listing-item--open", open);
    if (open && !loaded) void load();
  });

  const status =
    bundle.availability === "sold_out"
      ? t.bundleSoldOut
      : bundle.availability === "unavailable"
        ? t.bundleUnavailable
        : null;

  const article = el(
    "article",
    {
      class: `bc-bundle-card${buyable ? "" : " bc-bundle-card--off"}`,
      "aria-labelledby": titleId,
    },
    previews(bundle, ctx),
    el("h3", { class: "bc-title", id: titleId }, bundle.name),
    el("p", { class: "bc-meta" }, typeLabel(bundle, t)),
    bundle.description ? el("p", { class: "bc-description" }, bundle.description) : null,
    pricing(bundle, ctx),
    status ? el("p", { class: "bc-availability", role: "status" }, status) : null,
    toggle,
    panel,
  );
  // The card wears the bundle's own customization, from the same mapper as the widget.
  applyTheme(article, bundle.customization);
  item.append(article);
  return item;
}
