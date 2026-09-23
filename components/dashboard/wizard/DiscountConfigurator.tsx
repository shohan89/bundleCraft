"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DiscountType } from "./types";
import { validateDiscountValue } from "./types";

interface DiscountConfiguratorProps {
  discountType: DiscountType;
  discountValue: string;
  onDiscountTypeChange: (type: DiscountType) => void;
  onDiscountValueChange: (value: string) => void;
}

export function DiscountConfigurator({
  discountType,
  discountValue,
  onDiscountTypeChange,
  onDiscountValueChange,
}: DiscountConfiguratorProps) {
  const error =
    discountValue.trim() === "" ? null : validateDiscountValue(discountType, discountValue);

  return (
    <div className="max-w-sm space-y-5">
      <div className="space-y-1.5">
        <Label>Discount type</Label>
        <Tabs
          value={discountType}
          onValueChange={(value) => onDiscountTypeChange(value as DiscountType)}
        >
          <TabsList className="w-full">
            <TabsTrigger value="percentage" className="flex-1">
              Percentage
            </TabsTrigger>
            <TabsTrigger value="fixed_amount" className="flex-1">
              Fixed amount
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="discount-value">
          {discountType === "percentage" ? "Percentage off" : "Amount off (USD)"}
        </Label>
        <div className="relative">
          {discountType === "fixed_amount" ? (
            <span className="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2 text-sm">
              $
            </span>
          ) : null}
          <Input
            id="discount-value"
            inputMode="decimal"
            placeholder={discountType === "percentage" ? "20" : "30"}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "discount-value-error" : undefined}
            className={discountType === "fixed_amount" ? "pl-6" : undefined}
            value={discountValue}
            onChange={(event) => onDiscountValueChange(event.target.value)}
          />
          {discountType === "percentage" ? (
            <span className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2 text-sm">
              %
            </span>
          ) : null}
        </div>
        {error ? (
          <p id="discount-value-error" className="text-destructive text-sm">
            {error}
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            {discountType === "percentage"
              ? "Example: 20% off the combined product price."
              : "Example: Save $30 off the combined product price."}
          </p>
        )}
      </div>
    </div>
  );
}
