/**
 * Centralised, strict customization validation (used when a merchant saves, for template
 * defaults and for the bundle draft rules). One walker over the field table in ./spec.ts:
 * unknown keys are refused at every level, colours must be #RRGGBB (no rgb(), url(), var(),
 * keywords or expressions), and every other value must be one of a fixed list or a bounded
 * integer. Dependency-free, so the bundle rules that import it stay light.
 */
import { DEFAULT_CUSTOMIZATION } from "./defaults";
import { GROUP_SPECS, LAYOUT_SPEC, isPlainObject, isValidValue } from "./spec";
import type { BundleCustomization, BundleCustomizationPatch } from "./types";

export interface CustomizationIssue {
  field: string;
  code: "INVALID_CUSTOMIZATION" | "UNKNOWN_FIELD";
  message: string;
}

/** Own keys only: "constructor", "toString" or "__proto__" must never count as known fields. */
const has = (object: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(object, key);

const invalid = (field: string, message: string): CustomizationIssue => ({
  field,
  code: "INVALID_CUSTOMIZATION",
  message,
});
const unknown = (field: string, key: string): CustomizationIssue => ({
  field,
  code: "UNKNOWN_FIELD",
  message: `Unknown customization field: ${key}.`,
});

/**
 * Checks a customization. `complete` demands every field (a stored or merged customization);
 * otherwise any subset is accepted (a patch). Anything that is not exactly the documented
 * shape is reported, nothing is repaired.
 */
function inspect(raw: unknown, prefix: string, complete: boolean): CustomizationIssue[] {
  if (!isPlainObject(raw)) return [invalid(prefix, "Customization must be an object.")];
  const issues: CustomizationIssue[] = [];

  for (const key of Object.keys(raw)) {
    if (key !== "layout" && !has(GROUP_SPECS, key)) issues.push(unknown(`${prefix}.${key}`, key));
  }

  if ((raw.layout !== undefined || complete) && !isValidValue(LAYOUT_SPEC, raw.layout)) {
    issues.push(invalid(`${prefix}.layout`, LAYOUT_SPEC.message));
  }

  for (const [group, fields] of Object.entries(GROUP_SPECS)) {
    const value = raw[group];
    if (value === undefined) {
      if (complete) issues.push(invalid(`${prefix}.${group}`, `Missing ${group} settings.`));
      continue;
    }
    if (!isPlainObject(value)) {
      issues.push(invalid(`${prefix}.${group}`, `${group} settings must be an object.`));
      continue;
    }
    for (const key of Object.keys(value)) {
      if (!has(fields, key)) issues.push(unknown(`${prefix}.${group}.${key}`, key));
    }
    for (const [name, spec] of Object.entries(fields)) {
      const field = value[name];
      if (field === undefined) {
        if (complete) issues.push(invalid(`${prefix}.${group}.${name}`, "A value is required."));
      } else if (!isValidValue(spec, field)) {
        issues.push(invalid(`${prefix}.${group}.${name}`, spec.message));
      }
    }
  }
  return issues;
}

/** Rule check of a complete customization (what the bundle draft rules call). */
export function validateCustomization(
  customization: unknown,
  prefix = "customization",
): CustomizationIssue[] {
  return inspect(customization, prefix, true);
}

/** Fills the gaps of a partial customization from `base` (the defaults unless stated). */
export function mergeCustomization(
  patch: BundleCustomizationPatch,
  base: BundleCustomization = DEFAULT_CUSTOMIZATION,
): BundleCustomization {
  return {
    layout: patch.layout ?? base.layout,
    colors: { ...base.colors, ...patch.colors },
    typography: { ...base.typography, ...patch.typography },
    card: { ...base.card, ...patch.card },
    button: { ...base.button, ...patch.button },
    spacing: { ...base.spacing, ...patch.spacing },
  };
}

export type ParsedCustomization =
  { ok: true; value: BundleCustomization } | { ok: false; issues: CustomizationIssue[] };

/**
 * Untrusted input -> a complete, valid customization. Missing fields come from `base`; a bad
 * or unknown field fails the whole parse (nothing is half applied).
 */
export function parseCustomization(
  raw: unknown,
  base: BundleCustomization = DEFAULT_CUSTOMIZATION,
  prefix = "customization",
): ParsedCustomization {
  const issues = inspect(raw, prefix, false);
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: mergeCustomization(raw as BundleCustomizationPatch, base) };
}
