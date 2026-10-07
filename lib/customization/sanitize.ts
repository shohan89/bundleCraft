/**
 * Stored or received data -> a customization that is ALWAYS safe to render. Each field that
 * fails its check falls back to its default on its own, so one bad value never breaks the
 * storefront or discards the merchant's other valid choices. Used where failing is not an
 * option (storefront responses, widget theming), never where the merchant is saving: saving
 * goes through the strict parser in ./validation.ts. Both read the same table (./spec.ts).
 */
import { DEFAULT_CUSTOMIZATION } from "./defaults";
import { GROUP_SPECS, LAYOUT_SPEC, isPlainObject, isValidValue, type FieldSpec } from "./spec";
import type { BundleCustomization } from "./types";

function pick<T>(spec: FieldSpec, value: unknown, fallback: T): T {
  return isValidValue(spec, value) ? (value as T) : fallback;
}

export function sanitizeCustomization(raw: unknown): BundleCustomization {
  const d = DEFAULT_CUSTOMIZATION;
  const source = isPlainObject(raw) ? raw : {};
  const group = (name: string): Record<string, unknown> => {
    const value = source[name];
    return isPlainObject(value) ? value : {};
  };
  const c = group("colors");
  const t = group("typography");
  const k = group("card");
  const b = group("button");
  const s = group("spacing");
  const G = GROUP_SPECS;
  return {
    layout: pick(LAYOUT_SPEC, source.layout, d.layout),
    colors: {
      primary: pick(G.colors.primary, c.primary, d.colors.primary),
      button: pick(G.colors.button, c.button, d.colors.button),
      background: pick(G.colors.background, c.background, d.colors.background),
      accent: pick(G.colors.accent, c.accent, d.colors.accent),
      text: pick(G.colors.text, c.text, d.colors.text),
    },
    typography: {
      fontFamily: pick(G.typography.fontFamily, t.fontFamily, d.typography.fontFamily),
      fontSize: pick(G.typography.fontSize, t.fontSize, d.typography.fontSize),
      titleSize: pick(G.typography.titleSize, t.titleSize, d.typography.titleSize),
      descriptionSize: pick(
        G.typography.descriptionSize,
        t.descriptionSize,
        d.typography.descriptionSize,
      ),
    },
    card: {
      borderRadius: pick(G.card.borderRadius, k.borderRadius, d.card.borderRadius),
      shadow: pick(G.card.shadow, k.shadow, d.card.shadow),
    },
    button: {
      style: pick(G.button.style, b.style, d.button.style),
      size: pick(G.button.size, b.size, d.button.size),
    },
    spacing: { density: pick(G.spacing.density, s.density, d.spacing.density) },
  };
}
