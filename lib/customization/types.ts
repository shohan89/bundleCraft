/**
 * Storefront customization: the one vocabulary shared by the database mapping, the bundle and
 * customization APIs, the dashboard editor, and the storefront widget. Free of any runtime
 * import from the server, so it can be bundled into customer-facing JavaScript.
 *
 * It is a CONFIGURATION, never markup or CSS: every field is a predefined option, or a
 * #RRGGBB colour, or a bounded integer. Nothing here can carry a URL, a font file, or a
 * declaration.
 */

export const CUSTOMIZATION_LAYOUTS = ["card", "horizontal", "vertical"] as const;
export type CustomizationLayout = (typeof CUSTOMIZATION_LAYOUTS)[number];

/** Safe system font stacks only. "theme" inherits the merchant's own theme font. */
export const FONT_FAMILIES = ["theme", "sans", "serif", "mono"] as const;
export type FontFamily = (typeof FONT_FAMILIES)[number];

export const TEXT_SIZES = ["small", "medium", "large"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export const CARD_RADII = ["none", "small", "medium", "large"] as const;
export type CardRadius = (typeof CARD_RADII)[number];

export const CARD_SHADOWS = ["none", "subtle", "strong"] as const;
export type CardShadow = (typeof CARD_SHADOWS)[number];

export const BUTTON_STYLES = ["filled", "outline"] as const;
export type ButtonStyle = (typeof BUTTON_STYLES)[number];

export const BUTTON_SIZES = ["small", "medium", "large"] as const;
export type ButtonSize = (typeof BUTTON_SIZES)[number];

export const SPACING_DENSITIES = ["compact", "comfortable"] as const;
export type SpacingDensity = (typeof SPACING_DENSITIES)[number];

/** The only colour format accepted anywhere: six hex digits. */
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const FONT_SIZE_MIN = 12;
export const FONT_SIZE_MAX = 24;

export const COLOR_KEYS = ["primary", "button", "background", "accent", "text"] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

/** The complete, validated customization of one bundle. */
export interface BundleCustomization {
  layout: CustomizationLayout;
  colors: Record<ColorKey, string>;
  typography: {
    fontFamily: FontFamily;
    /** Base size in px (12 to 24). */
    fontSize: number;
    titleSize: TextSize;
    descriptionSize: TextSize;
  };
  card: { borderRadius: CardRadius; shadow: CardShadow };
  button: { style: ButtonStyle; size: ButtonSize };
  spacing: { density: SpacingDensity };
}

/** What a client may send: any subset of groups, each any subset of its fields. */
export interface BundleCustomizationPatch {
  layout?: CustomizationLayout;
  colors?: Partial<BundleCustomization["colors"]>;
  typography?: Partial<BundleCustomization["typography"]>;
  card?: Partial<BundleCustomization["card"]>;
  button?: Partial<BundleCustomization["button"]>;
  spacing?: Partial<BundleCustomization["spacing"]>;
}
