/**
 * The single mapper from a customization to what the storefront (and the dashboard preview,
 * which renders the very same widget) applies: CSS custom properties plus two data attributes.
 *
 * SECURITY: this is the only place a customization becomes CSS, and it never concatenates
 * merchant input. Colours are #RRGGBB (checked again here), the base size is a bounded
 * integer, and everything else is looked up in the tables below, so the only strings that can
 * reach `style.setProperty` are constants from this file or a validated hex colour. There is
 * no stylesheet generation, no <style> element and no URL.
 *
 * Dependency-free: bundled into the storefront script.
 */
import { readableTextOn } from "./contrast";
import { sanitizeCustomization } from "./sanitize";
import type {
  ButtonSize,
  CardRadius,
  CardShadow,
  CustomizationLayout,
  FontFamily,
  SpacingDensity,
  TextSize,
} from "./types";

const FONT_STACKS: Record<FontFamily, string> = {
  theme: "inherit",
  sans: 'system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
  serif: 'Georgia,"Times New Roman",Times,serif',
  mono: 'ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace',
};
const TITLE_SIZE: Record<TextSize, string> = { small: "1.1em", medium: "1.25em", large: "1.5em" };
const DESCRIPTION_SIZE: Record<TextSize, string> = {
  small: ".875em",
  medium: "1em",
  large: "1.125em",
};
const RADIUS: Record<CardRadius, { outer: string; inner: string }> = {
  none: { outer: "0", inner: "0" },
  small: { outer: "6px", inner: "4px" },
  medium: { outer: "12px", inner: "10px" },
  large: { outer: "20px", inner: "16px" },
};
const SHADOW: Record<CardShadow, string> = {
  none: "none",
  subtle: "0 1px 3px rgba(0,0,0,.12)",
  strong: "0 8px 24px rgba(0,0,0,.22)",
};
const SPACING: Record<SpacingDensity, { pad: string; gap: string }> = {
  compact: { pad: ".75rem", gap: ".5rem" },
  comfortable: { pad: "1rem", gap: ".75rem" },
};
const BUTTON: Record<ButtonSize, { pad: string; size: string; min: string }> = {
  small: { pad: ".45rem 1rem", size: ".9em", min: "44px" }, // 44px stays: it is the touch target minimum
  medium: { pad: ".6rem 1.25rem", size: "1em", min: "44px" },
  large: { pad: ".8rem 1.75rem", size: "1.1em", min: "52px" },
};

export interface ResolvedTheme {
  /** CSS custom properties for the widget root. */
  variables: Record<string, string>;
  layout: CustomizationLayout;
  buttonStyle: "filled" | "outline";
}

export function resolveTheme(customization: unknown): ResolvedTheme {
  const c = sanitizeCustomization(customization);
  return {
    layout: c.layout,
    buttonStyle: c.button.style,
    variables: {
      "--bc-primary": c.colors.primary,
      "--bc-button": c.colors.button,
      "--bc-bg": c.colors.background,
      "--bc-accent": c.colors.accent,
      "--bc-text": c.colors.text,
      "--bc-button-text": readableTextOn(c.colors.button),
      "--bc-font-size": `${c.typography.fontSize}px`,
      "--bc-font-family": FONT_STACKS[c.typography.fontFamily],
      "--bc-title-size": TITLE_SIZE[c.typography.titleSize],
      "--bc-desc-size": DESCRIPTION_SIZE[c.typography.descriptionSize],
      "--bc-radius": RADIUS[c.card.borderRadius].outer,
      "--bc-radius-inner": RADIUS[c.card.borderRadius].inner,
      "--bc-shadow": SHADOW[c.card.shadow],
      "--bc-pad": SPACING[c.spacing.density].pad,
      "--bc-gap": SPACING[c.spacing.density].gap,
      "--bc-btn-pad": BUTTON[c.button.size].pad,
      "--bc-btn-size": BUTTON[c.button.size].size,
      "--bc-btn-min": BUTTON[c.button.size].min,
    },
  };
}

/** Applies a customization to a storefront element (the widget root or a landing page card). */
export function applyTheme(element: HTMLElement, customization: unknown): void {
  const theme = resolveTheme(customization);
  for (const [name, value] of Object.entries(theme.variables)) {
    element.style.setProperty(name, value);
  }
  element.dataset.layout = theme.layout;
  element.dataset.buttonStyle = theme.buttonStyle;
}
