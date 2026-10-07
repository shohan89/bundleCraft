"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PREVIEW_LIMIT } from "@/lib/storefront/types";
import type { StorefrontBundle, StorefrontBundleCard } from "@/lib/storefront/types";
import { computeTotals } from "@/lib/storefront/pricing";
import { mountBundle, type WidgetContext } from "@/storefront/widget/bundle";
import { readConfig } from "@/storefront/widget/config";
import { mountListing } from "@/storefront/widget/listing";
import type { WizardState } from "./types";

type Surface = "product" | "landing";

const SAMPLE_PRODUCTS = ["Sample product 1", "Sample product 2", "Sample product 3"];

function previewDiscount(state: WizardState): StorefrontBundle["discount"] {
  const value = Number(state.discountValue);
  return state.discountValue.trim() !== "" && Number.isFinite(value) && value > 0
    ? { type: state.discountType, value }
    : { type: "percentage", value: 10 };
}

/**
 * The bundle as the storefront API would describe it, built from the wizard's current values.
 * Real products are used when the merchant already picked some; otherwise clearly labelled
 * samples. Nothing is fetched: the preview never calls Shopify or the storefront API.
 */
export function previewBundle(state: WizardState, templateName: string | null): StorefrontBundle {
  const chosen = state.products;
  const products =
    chosen.length > 0
      ? chosen.map((product) => ({
          key: product.shopifyVariantId,
          productId: product.shopifyProductId,
          variantId: product.shopifyVariantId,
          quantity: product.quantity,
          title: product.title,
          imageUrl: product.imageUrl,
          variants: [
            {
              id: product.shopifyVariantId,
              title: product.variantTitle ?? "Default",
              price: product.price,
              available:
                product.availability !== "unavailable" && product.availability !== "sold_out",
            },
          ],
        }))
      : SAMPLE_PRODUCTS.map((title, index) => ({
          key: `sample-${index}`,
          productId: `sample-${index}`,
          variantId: `sample-${index}`,
          quantity: 1,
          title,
          imageUrl: null,
          variants: [{ id: `sample-${index}`, title: "Default", price: "29.00", available: true }],
        }));

  const required = Number(state.requiredQuantity);
  return {
    id: "preview",
    name: state.title.trim() || templateName || "Your bundle",
    description: null,
    type: state.bundleType,
    requiredQuantity:
      state.bundleType === "fixed"
        ? null
        : Number.isInteger(required) && required > 0
          ? required
          : 2,
    discount: previewDiscount(state),
    customization: state.customization,
    productCount: products.length,
    products,
  };
}

function previewCard(bundle: StorefrontBundle): StorefrontBundleCard {
  const lines = bundle.products.map((product) => ({
    price: product.variants[0]?.price ?? null,
    quantity: product.quantity,
  }));
  return {
    id: bundle.id,
    name: bundle.name,
    description: bundle.description,
    type: bundle.type,
    requiredQuantity: bundle.requiredQuantity,
    discount: bundle.discount,
    productCount: bundle.productCount,
    preview: bundle.products
      .slice(0, PREVIEW_LIMIT)
      .map((product) => ({ title: product.title, imageUrl: product.imageUrl })),
    pricing: bundle.type === "fixed" ? computeTotals(lines, bundle.discount) : null,
    availability: "available",
    customization: bundle.customization,
  };
}

/** A context that can never reach the network: the preview is display only. */
function offlineContext(): WidgetContext {
  const root = document.createElement("div");
  root.dataset.currency = "USD";
  root.dataset.locale = "en-US";
  const refuse = () => Promise.reject(new Error("The preview does not use the network."));
  return {
    config: readConfig(root),
    api: {
      fetchBundles: refuse,
      fetchListing: refuse,
      prepareCart: refuse,
      addToCart: refuse,
      sendEvent: refuse,
    },
    tracker: { view: () => {}, add: () => {} },
  };
}

/**
 * Live preview: renders the REAL storefront widget (`mountBundle`) and landing card
 * (`mountListing`) from the current wizard values, so colours, layout, typography, spacing and
 * buttons look exactly as they will on the store. There is no second renderer. The preview is
 * `inert` (not focusable, not clickable) and offline.
 */
export function WidgetPreview({
  state,
  templateName,
}: {
  state: WizardState;
  templateName: string | null;
}) {
  const [surface, setSurface] = useState<Surface>("product");
  const host = useRef<HTMLDivElement>(null);
  const bundle = useMemo(() => previewBundle(state, templateName), [state, templateName]);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const ctx = offlineContext();
    if (surface === "product") {
      mountBundle(container, bundle, ctx);
    } else {
      mountListing(container, [previewCard(bundle)], ctx);
    }
    return () => container.replaceChildren();
  }, [bundle, surface]);

  return (
    <section aria-labelledby="preview-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="preview-heading" className="text-foreground text-sm font-semibold">
          Preview
        </h3>
        <div role="group" aria-label="Preview surface" className="flex gap-2">
          {(
            [
              ["product", "Product page"],
              ["landing", "Bundles page"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={surface === value ? "default" : "outline"}
              aria-pressed={surface === value}
              onClick={() => setSurface(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      <div
        className="border-border overflow-x-auto rounded-xl border p-3"
        data-testid="widget-preview"
      >
        <div ref={host} className="bc-root" inert />
      </div>
      <p className="text-muted-foreground text-xs">
        This is how your bundle will look on your store
        {state.products.length === 0 ? ", shown with sample products" : ""}. Buttons are switched
        off in the preview.
      </p>
    </section>
  );
}
