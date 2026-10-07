import type { BundleCustomization } from "./types";

/**
 * THE default customization. Every place that needs a fallback (a bundle with no saved
 * customization, an unreadable stored value, a new wizard, the reset button) uses this
 * object, so defaults are never scattered. It reproduces the storefront's original look.
 */
export const DEFAULT_CUSTOMIZATION: BundleCustomization = {
  layout: "card",
  colors: {
    primary: "#111827",
    button: "#111827",
    background: "#ffffff",
    accent: "#111827",
    text: "#111827",
  },
  typography: { fontFamily: "theme", fontSize: 16, titleSize: "medium", descriptionSize: "medium" },
  card: { borderRadius: "medium", shadow: "none" },
  button: { style: "filled", size: "medium" },
  spacing: { density: "comfortable" },
};

export const cloneDefaultCustomization = (): BundleCustomization =>
  structuredClone(DEFAULT_CUSTOMIZATION);
