/** WCAG contrast helpers for #RRGGBB colours. Pure, so the editor and the widget agree. */
import { HEX_COLOR } from "./types";

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  if (!HEX_COLOR.test(hex)) return 0;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between two colours, 1 (none) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

export const LIGHT_TEXT = "#ffffff";
export const DARK_TEXT = "#000000";

/**
 * The text colour that reads best on `background`. Buttons use it, so a merchant can pick any
 * button colour without ever getting unreadable label text.
 */
export function readableTextOn(background: string): string {
  return contrastRatio(LIGHT_TEXT, background) >= contrastRatio(DARK_TEXT, background)
    ? LIGHT_TEXT
    : DARK_TEXT;
}

export interface ContrastWarning {
  field: "text" | "primary" | "button" | "accent";
  message: string;
}

/** Non-blocking advice for the editor: which colour pairs are hard to read. */
export function contrastWarnings(
  colors: { text: string; primary: string; button: string; accent: string; background: string },
  buttonStyle: "filled" | "outline",
): ContrastWarning[] {
  const warnings: ContrastWarning[] = [];
  const check = (
    field: ContrastWarning["field"],
    color: string,
    minimum: number,
    label: string,
  ) => {
    const ratio = contrastRatio(color, colors.background);
    if (ratio < minimum) {
      warnings.push({
        field,
        message: `${label} may be hard to read on your background (contrast ${ratio.toFixed(1)}:1, aim for ${minimum}:1 or more).`,
      });
    }
  };
  check("text", colors.text, 4.5, "Text color");
  check("primary", colors.primary, 4.5, "Heading color");
  check("accent", colors.accent, 3, "Accent color");
  if (buttonStyle === "outline") check("button", colors.button, 4.5, "Button color");
  return warnings;
}
