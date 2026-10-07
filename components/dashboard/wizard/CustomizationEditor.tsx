"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { contrastWarnings } from "@/lib/customization/contrast";
import { validateCustomization } from "@/lib/customization/validation";
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
  type BundleCustomization,
  type ColorKey,
} from "@/lib/customization/types";
import { cn } from "@/lib/utils";
import type { WizardCustomization } from "./types";

interface CustomizationEditorProps {
  value: WizardCustomization;
  onChange: (value: WizardCustomization) => void;
  /** Restores the starting design: the template's when there is one, otherwise the defaults. */
  onReset: () => void;
  resetLabel: string;
}

const LABEL: Record<string, string> = {
  card: "Card",
  horizontal: "Horizontal",
  vertical: "Vertical",
  theme: "Match my theme",
  sans: "Clean sans-serif",
  serif: "Classic serif",
  mono: "Monospace",
  small: "Small",
  medium: "Medium",
  large: "Large",
  none: "None",
  subtle: "Subtle",
  strong: "Strong",
  filled: "Filled",
  outline: "Outline",
  compact: "Compact",
  comfortable: "Comfortable",
};

const fieldClass = cn(
  "border-border bg-background flex h-8 w-full rounded-lg border px-2.5 text-sm",
  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
);

function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className={fieldClass}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {LABEL[option] ?? option}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * A colour is picked with the native colour input or typed as #RRGGBB. Typing keeps its own text
 * so a half-typed value is never committed; only a valid #RRGGBB reaches the design, and
 * anything else shows an error next to the field.
 */
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? value;
  const invalid = draft !== null && !HEX_COLOR.test(draft);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-hex`}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={value}
          onChange={(event) => {
            setDraft(null);
            onChange(event.target.value);
          }}
          className={cn(
            "border-border size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1",
            "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
          )}
        />
        <input
          id={`${id}-hex`}
          type="text"
          inputMode="text"
          spellCheck={false}
          autoComplete="off"
          maxLength={7}
          value={text}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
          onChange={(event) => {
            const next = event.target.value.trim();
            if (HEX_COLOR.test(next)) {
              setDraft(null);
              onChange(next.toLowerCase());
            } else {
              setDraft(next);
            }
          }}
          onBlur={() => setDraft(null)}
          className={cn(fieldClass, "font-mono uppercase")}
        />
      </div>
      {invalid ? (
        <p id={`${id}-error`} role="alert" className="text-destructive text-xs">
          Use a color like #1A2B3C (# and six digits).
        </p>
      ) : null}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-border space-y-3 rounded-xl border p-4">
      <legend className="text-foreground px-1 text-sm font-semibold">{title}</legend>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function CustomizationEditor({
  value,
  onChange,
  onReset,
  resetLabel,
}: CustomizationEditorProps) {
  const uid = useId();
  const set = (patch: Partial<BundleCustomization>) => onChange({ ...value, ...patch });
  const color = (key: ColorKey) => (next: string) =>
    set({ colors: { ...value.colors, [key]: next } });
  const warnings = contrastWarnings(value.colors, value.button.style);
  const sizeIssue = validateCustomization(value).find(
    (issue) => issue.field === "customization.typography.fontSize",
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          Choose how your bundles look. Changes show in the preview straight away.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onReset}>
          {resetLabel}
        </Button>
      </div>

      <Group title="Layout">
        <SelectField
          id={`${uid}-layout`}
          label="Layout"
          value={value.layout}
          options={CUSTOMIZATION_LAYOUTS}
          onChange={(layout) => set({ layout })}
        />
        <SelectField
          id={`${uid}-spacing`}
          label="Spacing"
          value={value.spacing.density}
          options={SPACING_DENSITIES}
          onChange={(density) => set({ spacing: { density } })}
        />
      </Group>

      <Group title="Colors">
        <ColorField
          label="Primary color"
          value={value.colors.primary}
          onChange={color("primary")}
        />
        <ColorField label="Button color" value={value.colors.button} onChange={color("button")} />
        <ColorField
          label="Background color"
          value={value.colors.background}
          onChange={color("background")}
        />
        <ColorField label="Accent color" value={value.colors.accent} onChange={color("accent")} />
        <ColorField label="Text color" value={value.colors.text} onChange={color("text")} />
      </Group>
      {warnings.length > 0 ? (
        <div role="status" aria-label="Color contrast advice" className="text-sm text-amber-700">
          <ul className="list-disc space-y-1 pl-5">
            {warnings.map((warning) => (
              <li key={warning.field}>{warning.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Group title="Typography">
        <SelectField
          id={`${uid}-font`}
          label="Font"
          value={value.typography.fontFamily}
          options={FONT_FAMILIES}
          onChange={(fontFamily) => set({ typography: { ...value.typography, fontFamily } })}
        />
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-size`}>Font size (px)</Label>
          <input
            id={`${uid}-size`}
            type="number"
            min={FONT_SIZE_MIN}
            max={FONT_SIZE_MAX}
            aria-invalid={sizeIssue !== undefined}
            aria-describedby={sizeIssue ? `${uid}-size-error` : undefined}
            value={value.typography.fontSize}
            onChange={(event) =>
              set({ typography: { ...value.typography, fontSize: Number(event.target.value) } })
            }
            className={fieldClass}
          />
          {sizeIssue ? (
            <p id={`${uid}-size-error`} role="alert" className="text-destructive text-xs">
              {sizeIssue.message}
            </p>
          ) : null}
        </div>
        <SelectField
          id={`${uid}-title`}
          label="Heading size"
          value={value.typography.titleSize}
          options={TEXT_SIZES}
          onChange={(titleSize) => set({ typography: { ...value.typography, titleSize } })}
        />
        <SelectField
          id={`${uid}-description`}
          label="Description size"
          value={value.typography.descriptionSize}
          options={TEXT_SIZES}
          onChange={(descriptionSize) =>
            set({ typography: { ...value.typography, descriptionSize } })
          }
        />
      </Group>

      <Group title="Cards">
        <SelectField
          id={`${uid}-radius`}
          label="Corner radius"
          value={value.card.borderRadius}
          options={CARD_RADII}
          onChange={(borderRadius) => set({ card: { ...value.card, borderRadius } })}
        />
        <SelectField
          id={`${uid}-shadow`}
          label="Shadow"
          value={value.card.shadow}
          options={CARD_SHADOWS}
          onChange={(shadow) => set({ card: { ...value.card, shadow } })}
        />
      </Group>

      <Group title="Button">
        <SelectField
          id={`${uid}-button-style`}
          label="Button style"
          value={value.button.style}
          options={BUTTON_STYLES}
          onChange={(style) => set({ button: { ...value.button, style } })}
        />
        <SelectField
          id={`${uid}-button-size`}
          label="Button size"
          value={value.button.size}
          options={BUTTON_SIZES}
          onChange={(size) => set({ button: { ...value.button, size } })}
        />
      </Group>
    </div>
  );
}
