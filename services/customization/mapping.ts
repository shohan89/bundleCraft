import type { Customization } from "@/lib/generated/prisma/client";
import type { BundleCustomization } from "@/lib/customization/types";

type Row = Pick<
  Customization,
  | "layout"
  | "primaryColor"
  | "buttonColor"
  | "backgroundColor"
  | "accentColor"
  | "textColor"
  | "fontFamily"
  | "fontSize"
  | "titleSize"
  | "descriptionSize"
  | "cardRadius"
  | "cardShadow"
  | "buttonStyle"
  | "buttonSize"
  | "spacingDensity"
>;

/** Database row -> the nested configuration used everywhere else. Never includes ids or dates. */
export function customizationFromRow(row: Row): BundleCustomization {
  return {
    layout: row.layout,
    colors: {
      primary: row.primaryColor,
      button: row.buttonColor,
      background: row.backgroundColor,
      accent: row.accentColor,
      text: row.textColor,
    },
    typography: {
      fontFamily: row.fontFamily,
      fontSize: row.fontSize,
      titleSize: row.titleSize,
      descriptionSize: row.descriptionSize,
    },
    card: { borderRadius: row.cardRadius, shadow: row.cardShadow },
    button: { style: row.buttonStyle, size: row.buttonSize },
    spacing: { density: row.spacingDensity },
  };
}

/** Configuration -> the row columns (the caller has validated it). */
export function customizationToRow(customization: BundleCustomization): Row {
  return {
    layout: customization.layout,
    primaryColor: customization.colors.primary,
    buttonColor: customization.colors.button,
    backgroundColor: customization.colors.background,
    accentColor: customization.colors.accent,
    textColor: customization.colors.text,
    fontFamily: customization.typography.fontFamily,
    fontSize: customization.typography.fontSize,
    titleSize: customization.typography.titleSize,
    descriptionSize: customization.typography.descriptionSize,
    cardRadius: customization.card.borderRadius,
    cardShadow: customization.card.shadow,
    buttonStyle: customization.button.style,
    buttonSize: customization.button.size,
    spacingDensity: customization.spacing.density,
  };
}
