/**
 * The one description of what a customization may contain. Validation (strict, for saving),
 * sanitising (lenient, for rendering) and the dashboard all read this table, so a rule is
 * written once. Dependency-free: it ends up in the storefront script.
 */
import {
  BUTTON_SIZES,
  BUTTON_STYLES,
  CARD_RADII,
  CARD_SHADOWS,
  CUSTOMIZATION_LAYOUTS,
  FONT_FAMILIES,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  HEX_COLOR,
  SPACING_DENSITIES,
  TEXT_SIZES,
} from "./types";

export type FieldSpec =
  | { kind: "option"; values: readonly string[]; message: string }
  | { kind: "color"; message: string }
  | { kind: "int"; min: number; max: number; message: string };

const option = (values: readonly string[], what: string): FieldSpec => ({
  kind: "option",
  values,
  message: `${what} must be one of: ${values.join(", ")}.`,
});
const color: FieldSpec = { kind: "color", message: "Colors must be in #RRGGBB format." };

/** Top-level fields that are a single value. */
export const LAYOUT_SPEC: FieldSpec = option(CUSTOMIZATION_LAYOUTS, "Layout");

/** Fields grouped as they appear in the configuration. */
export const GROUP_SPECS: Record<string, Record<string, FieldSpec>> = {
  colors: { primary: color, button: color, background: color, accent: color, text: color },
  typography: {
    fontFamily: option(FONT_FAMILIES, "Font"),
    fontSize: {
      kind: "int",
      min: FONT_SIZE_MIN,
      max: FONT_SIZE_MAX,
      message: `Font size must be a whole number from ${FONT_SIZE_MIN} to ${FONT_SIZE_MAX}.`,
    },
    titleSize: option(TEXT_SIZES, "Heading size"),
    descriptionSize: option(TEXT_SIZES, "Description size"),
  },
  card: {
    borderRadius: option(CARD_RADII, "Corner radius"),
    shadow: option(CARD_SHADOWS, "Shadow"),
  },
  button: {
    style: option(BUTTON_STYLES, "Button style"),
    size: option(BUTTON_SIZES, "Button size"),
  },
  spacing: { density: option(SPACING_DENSITIES, "Spacing") },
};

/** True when `value` is acceptable for the field. The only place a value is judged. */
export function isValidValue(spec: FieldSpec, value: unknown): boolean {
  switch (spec.kind) {
    case "option":
      return typeof value === "string" && spec.values.includes(value);
    case "color":
      return typeof value === "string" && HEX_COLOR.test(value);
    case "int":
      return (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= spec.min &&
        value <= spec.max
      );
  }
}

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
