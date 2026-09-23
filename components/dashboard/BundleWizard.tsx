"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CustomizationEditor } from "@/components/dashboard/wizard/CustomizationEditor";
import { DiscountConfigurator } from "@/components/dashboard/wizard/DiscountConfigurator";
import { BundlePreview } from "@/components/dashboard/wizard/BundlePreview";
import { ProductSelector } from "@/components/dashboard/wizard/ProductSelector";
import { StepIndicator } from "@/components/dashboard/wizard/StepIndicator";
import { TemplateSelector } from "@/components/dashboard/wizard/TemplateSelector";
import {
  INITIAL_WIZARD_STATE,
  WIZARD_STEPS,
  validateDiscountValue,
  type WizardState,
  type WizardTemplate,
} from "@/components/dashboard/wizard/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface BundleWizardProps {
  templates: WizardTemplate[];
}

/**
 * Wizard UI shell for ACTION-004. There is intentionally no persistence
 * here — Save Draft/Publish don't call an API because the bundle engine
 * (ACTION-005) that would create the record doesn't exist yet. This
 * builds the full step flow, validation UX, and review preview so
 * ACTION-005 only needs to wire real submit handlers in, not redesign
 * the page.
 */
export function BundleWizard({ templates }: BundleWizardProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [state, setState] = useState<WizardState>(INITIAL_WIZARD_STATE);

  const currentStep = WIZARD_STEPS[stepIndex];
  const selectedTemplate = templates.find((template) => template.id === state.templateId) ?? null;

  const discountError = useMemo(
    () => validateDiscountValue(state.discountType, state.discountValue),
    [state.discountType, state.discountValue],
  );

  const canAdvance = useMemo(() => {
    if (currentStep.id === "template") return state.templateId !== null;
    if (currentStep.id === "discount") return discountError === null;
    return true;
  }, [currentStep.id, state.templateId, discountError]);

  function goNext() {
    if (!canAdvance) return;
    setStepIndex((index) => Math.min(index + 1, WIZARD_STEPS.length - 1));
  }

  function goBack() {
    setStepIndex((index) => Math.max(index - 1, 0));
  }

  return (
    <div className="space-y-6">
      <StepIndicator currentStepIndex={stepIndex} />

      <div className="min-h-72">
        {currentStep.id === "template" ? (
          <div className="space-y-6">
            <div className="max-w-sm space-y-1.5">
              <Label htmlFor="bundle-title">Bundle name</Label>
              <Input
                id="bundle-title"
                placeholder="Summer Outfit Bundle"
                value={state.title}
                onChange={(event) => setState({ ...state, title: event.target.value })}
              />
            </div>
            <TemplateSelector
              templates={templates}
              selectedTemplateId={state.templateId}
              onSelect={(templateId) => setState({ ...state, templateId })}
            />
          </div>
        ) : null}

        {currentStep.id === "products" ? <ProductSelector /> : null}

        {currentStep.id === "discount" ? (
          <DiscountConfigurator
            discountType={state.discountType}
            discountValue={state.discountValue}
            onDiscountTypeChange={(discountType) => setState({ ...state, discountType })}
            onDiscountValueChange={(discountValue) => setState({ ...state, discountValue })}
          />
        ) : null}

        {currentStep.id === "design" ? (
          <CustomizationEditor
            value={state.customization}
            onChange={(customization) => setState({ ...state, customization })}
          />
        ) : null}

        {currentStep.id === "publish" ? (
          <div className="space-y-6">
            <dl className="border-border grid grid-cols-1 gap-4 rounded-xl border p-4 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground text-xs font-medium">Bundle name</dt>
                <dd className="text-foreground text-sm">
                  {state.title || selectedTemplate?.name || "Untitled bundle"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs font-medium">Template</dt>
                <dd className="text-foreground text-sm">
                  {selectedTemplate?.name ?? "None selected"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs font-medium">Discount</dt>
                <dd className="text-foreground text-sm">
                  {discountError
                    ? "Not set"
                    : state.discountType === "percentage"
                      ? `${state.discountValue}% off`
                      : `Save $${state.discountValue}`}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs font-medium">Products</dt>
                <dd className="text-foreground text-sm">Not connected yet</dd>
              </div>
            </dl>

            <div className="space-y-2">
              <h3 className="text-foreground text-sm font-semibold">Storefront preview</h3>
              <BundlePreview state={state} templateName={selectedTemplate?.name ?? null} />
            </div>

            <p className="text-muted-foreground text-sm">
              Saving and publishing bundles will be available once the bundle engine launches. Your
              choices above show exactly what will be created.
            </p>
          </div>
        ) : null}
      </div>

      <div className="border-border flex items-center justify-between border-t pt-4">
        <Button variant="ghost" asChild>
          <Link href="/dashboard/bundles">Cancel</Link>
        </Button>

        <div className="flex items-center gap-2">
          {stepIndex > 0 ? (
            <Button variant="outline" onClick={goBack}>
              Back
            </Button>
          ) : null}
          {currentStep.id !== "publish" ? (
            <Button onClick={goNext} disabled={!canAdvance}>
              Next
            </Button>
          ) : (
            <>
              <Button variant="outline" disabled title="Available once the bundle engine launches">
                Save draft
              </Button>
              <Button disabled title="Available once the bundle engine launches">
                Publish
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
