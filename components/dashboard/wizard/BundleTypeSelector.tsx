"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { validateRequiredQuantityInput, type BundleType } from "./types";

interface BundleTypeSelectorProps {
  bundleType: BundleType;
  requiredQuantity: string;
  onBundleTypeChange: (type: BundleType) => void;
  onRequiredQuantityChange: (value: string) => void;
}

const TYPE_OPTIONS: { value: BundleType; label: string }[] = [
  { value: "fixed", label: "Fixed" },
  { value: "quantity", label: "Quantity" },
  { value: "mix_match", label: "Mix & match" },
];

const TYPE_HELP: Record<BundleType, string> = {
  fixed: "A set group of products sold together.",
  quantity: "Customers buy a set number of items and get the discount.",
  mix_match: "Customers choose any items from your list and get the discount.",
};

export function BundleTypeSelector({
  bundleType,
  requiredQuantity,
  onBundleTypeChange,
  onRequiredQuantityChange,
}: BundleTypeSelectorProps) {
  const error =
    requiredQuantity.trim() === ""
      ? null
      : validateRequiredQuantityInput(bundleType, requiredQuantity);

  return (
    <div className="max-w-sm space-y-4">
      <div className="space-y-1.5">
        <Label id="bundle-type-label">Bundle type</Label>
        {/* A single choice among three: a radio group (arrow keys move and select), not tabs,
            because nothing here controls a separate tab panel. */}
        <div
          role="radiogroup"
          aria-labelledby="bundle-type-label"
          className="bg-muted inline-flex w-full items-center rounded-lg p-1"
          onKeyDown={(event) => {
            const step =
              event.key === "ArrowRight" || event.key === "ArrowDown"
                ? 1
                : event.key === "ArrowLeft" || event.key === "ArrowUp"
                  ? -1
                  : 0;
            if (step === 0) return;
            event.preventDefault();
            const index = TYPE_OPTIONS.findIndex((option) => option.value === bundleType);
            const next = TYPE_OPTIONS[(index + step + TYPE_OPTIONS.length) % TYPE_OPTIONS.length];
            onBundleTypeChange(next.value);
            event.currentTarget
              .querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)
              ?.focus();
          }}
        >
          {TYPE_OPTIONS.map((option) => {
            const selected = option.value === bundleType;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                data-value={option.value}
                onClick={() => onBundleTypeChange(option.value)}
                className={cn(
                  "flex-1 rounded-md px-3 py-1 text-sm font-medium transition-colors",
                  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                  selected
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <p className="text-muted-foreground text-sm">{TYPE_HELP[bundleType]}</p>
      </div>

      {bundleType !== "fixed" ? (
        <div className="space-y-1.5">
          <Label htmlFor="required-quantity">Required quantity</Label>
          <Input
            id="required-quantity"
            inputMode="numeric"
            placeholder="3"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "required-quantity-error" : undefined}
            value={requiredQuantity}
            onChange={(event) => onRequiredQuantityChange(event.target.value)}
          />
          {error ? (
            <p id="required-quantity-error" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
