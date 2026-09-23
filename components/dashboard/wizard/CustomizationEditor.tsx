"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { CustomizationLayout, WizardCustomization } from "./types";

interface CustomizationEditorProps {
  value: WizardCustomization;
  onChange: (value: WizardCustomization) => void;
}

const LAYOUT_OPTIONS: { value: CustomizationLayout; label: string }[] = [
  { value: "card", label: "Card" },
  { value: "horizontal", label: "Horizontal" },
  { value: "vertical", label: "Vertical" },
];

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "border-border size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1",
            "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
          )}
        />
        <span className="text-muted-foreground text-sm uppercase">{value}</span>
      </div>
    </div>
  );
}

export function CustomizationEditor({ value, onChange }: CustomizationEditorProps) {
  return (
    <div className="max-w-lg space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ColorField
          id="primary-color"
          label="Primary color"
          value={value.primaryColor}
          onChange={(primaryColor) => onChange({ ...value, primaryColor })}
        />
        <ColorField
          id="button-color"
          label="Button color"
          value={value.buttonColor}
          onChange={(buttonColor) => onChange({ ...value, buttonColor })}
        />
        <ColorField
          id="background-color"
          label="Background color"
          value={value.backgroundColor}
          onChange={(backgroundColor) => onChange({ ...value, backgroundColor })}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="layout-select">Layout</Label>
          <Select
            value={value.layout}
            onValueChange={(layout) =>
              onChange({ ...value, layout: layout as CustomizationLayout })
            }
          >
            <SelectTrigger id="layout-select" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LAYOUT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="font-size">Font size (px)</Label>
          <input
            id="font-size"
            type="number"
            min={12}
            max={24}
            value={value.fontSize}
            onChange={(event) => onChange({ ...value, fontSize: Number(event.target.value) })}
            className="border-border bg-background focus-visible:ring-ring flex h-8 w-full rounded-lg border px-2.5 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          />
        </div>
      </div>
    </div>
  );
}
