import { computeTotals } from "@/lib/storefront/pricing";
import { resolveSelection, toSelectionBundle } from "@/lib/storefront/selection";
import type {
  BundleSelectionItem,
  StorefrontBundle,
  StorefrontProduct,
} from "@/lib/storefront/types";
import type { WidgetApi } from "./api";
import { WidgetError } from "./api";
import type { Tracker } from "./analytics";
import { applyTheme } from "@/lib/customization/theme";
import { format, type WidgetConfig } from "./config";
import { el, formatMoney, safeImageUrl, sizedImageUrl } from "./dom";

/** Product photos are asked from Shopify's CDN at this width (they display at most ~250 px, 400 covers 1.6x screens). */
const PRODUCT_IMAGE_WIDTH = 400;

export interface WidgetContext {
  config: WidgetConfig;
  api: WidgetApi;
  tracker: Tracker;
}

interface RowState {
  product: StorefrontProduct;
  variantId: string;
  quantity: number;
  selected: boolean;
  card: HTMLElement;
  price: HTMLElement;
  control: {
    checkbox?: HTMLInputElement;
    checkboxText?: HTMLElement;
    output?: HTMLElement;
    minus?: HTMLButtonElement;
    plus?: HTMLButtonElement;
    soldOut: HTMLElement;
  };
}

let instanceCounter = 0;

function discountLabel(bundle: StorefrontBundle, config: WidgetConfig): string {
  const amount =
    bundle.discount.type === "percentage"
      ? `${bundle.discount.value}%`
      : formatMoney(bundle.discount.value, config.currency, config.locale);
  return format(config.strings.save, { amount });
}

/**
 * Renders one interactive bundle into `container`. Selection rules come
 * from the shared `resolveSelection` — the same function the server runs
 * before returning cart lines — so what the widget allows and what the
 * server accepts can't drift apart. Validation here is for instant
 * feedback only; the server has the final say.
 */
export function mountBundle(
  container: HTMLElement,
  bundle: StorefrontBundle,
  ctx: WidgetContext,
): void {
  const { config, api, tracker } = ctx;
  const t = config.strings;
  const uid = `bc${++instanceCounter}`;
  const selectionBundle = toSelectionBundle(bundle);
  const required = bundle.requiredQuantity ?? 0;
  const isFixed = bundle.type === "fixed";
  const isQuantity = bundle.type === "quantity";

  const root = el("section", { class: "bc-widget", "aria-label": bundle.name });
  applyTheme(root, bundle.customization);

  const rows: RowState[] = bundle.products.map((product, index) => {
    const variantOptions = product.variants;
    const price = el("p", { class: "bc-price" });
    const soldOut = el("p", { class: "bc-soldout", hidden: true }, t.soldOut);
    const name = product.title ?? t.product;
    const control: RowState["control"] = { soldOut };

    let selector: HTMLElement | null = null;
    if (variantOptions.length > 1) {
      const selectId = `${uid}-v${index}`;
      const select = el("select", { id: selectId, class: "bc-select" });
      for (const variant of variantOptions) {
        if (!variant.available && variant.id !== product.variantId) continue;
        select.append(
          el(
            "option",
            {
              value: variant.id,
              selected: variant.id === product.variantId,
              disabled: !variant.available,
            },
            variant.available ? variant.title : `${variant.title} – ${t.soldOut}`,
          ),
        );
      }
      selector = el(
        "div",
        { class: "bc-variant" },
        el(
          "label",
          { class: "bc-sr-only", for: selectId },
          format(t.chooseOption, { product: name }),
        ),
        select,
      );
    }

    let selection: HTMLElement;
    if (isFixed) {
      selection = el(
        "p",
        { class: "bc-included" },
        product.quantity > 1 ? `${t.included} × ${product.quantity}` : t.included,
      );
    } else if (isQuantity) {
      const minus = el(
        "button",
        { type: "button", class: "bc-step", "aria-label": format(t.decrease, { product: name }) },
        "−",
      );
      const output = el("output", { class: "bc-count", "aria-live": "polite" }, "0");
      const plus = el(
        "button",
        { type: "button", class: "bc-step", "aria-label": format(t.increase, { product: name }) },
        "+",
      );
      control.minus = minus;
      control.output = output;
      control.plus = plus;
      selection = el("div", { class: "bc-stepper" }, minus, output, plus);
    } else {
      const checkboxId = `${uid}-c${index}`;
      const checkbox = el("input", { type: "checkbox", id: checkboxId, class: "bc-checkbox" });
      const text = el("span", {}, t.selected);
      control.checkbox = checkbox;
      control.checkboxText = text;
      selection = el("label", { class: "bc-check", for: checkboxId }, checkbox, text);
    }

    const imageUrl = safeImageUrl(product.imageUrl);
    const media = imageUrl
      ? el("img", {
          class: "bc-image",
          src: sizedImageUrl(imageUrl, PRODUCT_IMAGE_WIDTH),
          alt: name,
          loading: "lazy",
          decoding: "async",
          width: 160,
          height: 160,
        })
      : el("div", { class: "bc-image bc-image--empty", role: "img", "aria-label": name });

    const card = el(
      "li",
      { class: "bc-card" },
      el("div", { class: "bc-media" }, media),
      el(
        "div",
        { class: "bc-card-body" },
        el("h4", { class: "bc-product-title" }, name),
        selector,
        price,
        soldOut,
        selection,
      ),
    );

    return {
      product,
      variantId: product.variantId,
      quantity: isFixed ? product.quantity : isQuantity ? 0 : product.quantity,
      selected: isFixed,
      card,
      price,
      control,
    };
  });

  // ----- summary / actions ---------------------------------------------------
  const progress = el("p", { class: "bc-progress", hidden: isFixed });
  const prices = el("dl", { class: "bc-prices", hidden: true });
  const hint = el("p", { class: "bc-hint", "aria-live": "polite" });
  const feedback = el("p", { class: "bc-feedback", "aria-live": "polite" });
  const button = el("button", { type: "button", class: "bc-button" }, t.add);

  root.append(
    el(
      "header",
      { class: "bc-header" },
      el("h3", { class: "bc-title" }, bundle.name),
      el("span", { class: "bc-badge" }, discountLabel(bundle, config)),
    ),
    ...(bundle.description ? [el("p", { class: "bc-description" }, bundle.description)] : []),
    el("ul", { class: "bc-products" }, ...rows.map((row) => row.card)),
    el("div", { class: "bc-summary" }, progress, prices, hint, button, feedback),
  );

  // ----- state -----------------------------------------------------------------
  const variantOf = (row: RowState) =>
    row.product.variants.find((variant) => variant.id === row.variantId);
  const isAvailable = (row: RowState) => variantOf(row)?.available !== false;

  const currentItems = (): BundleSelectionItem[] =>
    rows
      .filter((row) => (isFixed ? true : isQuantity ? row.quantity > 0 : row.selected))
      .map((row) => ({ key: row.product.key, variantId: row.variantId, quantity: row.quantity }));

  const selectedCount = () =>
    isQuantity
      ? rows.reduce((sum, row) => sum + row.quantity, 0)
      : rows.filter((row) => row.selected).length;

  let busy = false;

  function update(): void {
    // A variant that went out of stock can't stay selected.
    for (const row of rows) {
      if (!isAvailable(row) && !isFixed) {
        row.selected = false;
        if (isQuantity) row.quantity = 0;
      }
    }

    const count = selectedCount();
    const full = !isFixed && count >= required;

    for (const row of rows) {
      const available = isAvailable(row);
      const price = variantOf(row)?.price ?? null;
      row.price.textContent =
        price === null ? "" : formatMoney(Number(price), config.currency, config.locale);
      row.control.soldOut.hidden = available;
      row.card.dataset.selected = String(
        isFixed ? true : isQuantity ? row.quantity > 0 : row.selected,
      );

      if (row.control.checkbox) {
        row.control.checkbox.checked = row.selected;
        row.control.checkbox.disabled = !available || (!row.selected && full);
      }
      if (row.control.output) row.control.output.textContent = String(row.quantity);
      if (row.control.minus) row.control.minus.disabled = row.quantity === 0;
      if (row.control.plus) row.control.plus.disabled = !available || full;
    }

    const result = resolveSelection(selectionBundle, currentItems());
    const outOfStock = isFixed && rows.some((row) => !isAvailable(row));

    progress.textContent = format(t.selectedCount, { count, total: required });
    hint.textContent = outOfStock ? t.soldOut : result.ok ? "" : result.issue.message;
    button.disabled = busy || !result.ok || outOfStock;

    const totals = result.ok
      ? computeTotals(
          result.lines.map((line) => {
            const row = rows.find((candidate) => candidate.product.key === line.key);
            return { price: row ? (variantOf(row)?.price ?? null) : null, quantity: line.quantity };
          }),
          bundle.discount,
        )
      : null;
    prices.hidden = totals === null;
    prices.replaceChildren();
    if (totals) {
      const money = (value: number) => formatMoney(value, config.currency, config.locale);
      const line = (label: string, value: string, className = "") =>
        el(
          "div",
          { class: `bc-price-line ${className}`.trim() },
          el("dt", {}, label),
          el("dd", {}, value),
        );
      prices.append(
        line(t.regular, money(totals.subtotal), "bc-price-line--regular"),
        line(t.youSave, money(totals.savings)),
        line(t.bundlePrice, money(totals.total), "bc-price-line--total"),
      );
    }
  }

  // ----- events --------------------------------------------------------------
  for (const row of rows) {
    row.card.querySelector("select")?.addEventListener("change", (event) => {
      row.variantId = (event.target as HTMLSelectElement).value;
      feedback.textContent = "";
      update();
    });
    row.control.checkbox?.addEventListener("change", () => {
      row.selected = row.control.checkbox?.checked ?? false;
      feedback.textContent = "";
      update();
    });
    row.control.plus?.addEventListener("click", () => {
      if (selectedCount() < required && row.quantity < required) row.quantity += 1;
      feedback.textContent = "";
      update();
    });
    row.control.minus?.addEventListener("click", () => {
      if (row.quantity > 0) row.quantity -= 1;
      feedback.textContent = "";
      update();
    });
  }

  button.addEventListener("click", () => {
    void addToCart();
  });

  async function addToCart(): Promise<void> {
    const result = resolveSelection(selectionBundle, currentItems());
    if (busy) return;
    if (!result.ok) {
      feedback.textContent = result.issue.message;
      return;
    }

    busy = true;
    root.setAttribute("aria-busy", "true");
    button.textContent = t.adding;
    feedback.replaceChildren();
    update();

    try {
      const lines = await api.prepareCart(
        bundle.id,
        result.lines.map(({ key, variantId, quantity }) => ({ key, variantId, quantity })),
      );
      await api.addToCart(lines);
      // Only reached after Shopify accepted the cart add: a failed add throws above.
      tracker.add(bundle.id, lines[0]?.properties._bundle_instance_id);
      feedback.replaceChildren(
        t.added,
        " ",
        el("a", { class: "bc-cart-link", href: config.cartUrl }, t.viewCart),
      );
      root.dispatchEvent(
        new CustomEvent("bundlecraft:added", { bubbles: true, detail: { bundleId: bundle.id } }),
      );
    } catch (error) {
      feedback.textContent = error instanceof WidgetError ? error.message : t.cartFailed;
    } finally {
      busy = false;
      root.removeAttribute("aria-busy");
      button.textContent = t.add;
      update();
    }
  }

  update();
  container.replaceChildren(root);
  tracker.view(bundle.id);
}
