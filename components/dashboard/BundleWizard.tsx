"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { BundleTypeSelector } from "@/components/dashboard/wizard/BundleTypeSelector";
import { CustomizationEditor } from "@/components/dashboard/wizard/CustomizationEditor";
import { DiscountConfigurator } from "@/components/dashboard/wizard/DiscountConfigurator";
import { ProductSelector } from "@/components/dashboard/wizard/ProductSelector";
import { StepIndicator } from "@/components/dashboard/wizard/StepIndicator";
import { TemplateSelector } from "@/components/dashboard/wizard/TemplateSelector";
import {
  INITIAL_WIZARD_STATE,
  applyTemplate,
  WIZARD_STEPS,
  validateDiscountValue,
  validateRequiredQuantityInput,
  wizardStateToPayload,
  type WizardState,
  type WizardTemplate,
} from "@/components/dashboard/wizard/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, type ApiFailure } from "@/lib/api/client";
import { cloneDefaultCustomization } from "@/lib/customization/defaults";
import { validateCustomization } from "@/lib/customization/validation";

// The live preview (it carries the whole storefront widget) is only needed from the Design step
// on, so it is loaded on demand instead of with the first step of the wizard.
const WidgetPreview = dynamic(
  () =>
    import("@/components/dashboard/wizard/WidgetPreview").then((module) => module.WidgetPreview),
  {
    ssr: false,
    loading: () => (
      <p role="status" className="text-muted-foreground text-sm">
        Loading preview…
      </p>
    ),
  },
);

interface BundleWizardProps {
  templates: WizardTemplate[];
  /** Edit mode: the bundle being edited and its current values. */
  bundleId?: string;
  initialState?: WizardState;
  /** Edit mode: name of the bundle's saved template when it is no longer offered. */
  retiredTemplateName?: string | null;
}

interface Failure {
  heading: string;
  error: ApiFailure;
}

/**
 * Create/edit wizard. All rules and persistence live on the server (the
 * bundle API); this component only collects input, shows the same
 * validation messages inline for a good UX, and displays whatever the
 * server says — it never decides that a bundle is publishable itself.
 */
export function BundleWizard({
  templates,
  bundleId,
  initialState,
  retiredTemplateName = null,
}: BundleWizardProps) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [state, setState] = useState<WizardState>(initialState ?? INITIAL_WIZARD_STATE);
  // Set once the bundle exists, so a failed publish followed by a retry
  // updates that bundle instead of creating a second one.
  const [savedId, setSavedId] = useState<string | null>(bundleId ?? null);
  const [pending, setPending] = useState<"draft" | "publish" | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  const isEditing = savedId !== null;
  const currentStep = WIZARD_STEPS[stepIndex];
  const selectedTemplate = templates.find((template) => template.id === state.templateId) ?? null;

  const discountError = useMemo(
    () => validateDiscountValue(state.discountType, state.discountValue),
    [state.discountType, state.discountValue],
  );
  const quantityError = useMemo(
    () => validateRequiredQuantityInput(state.bundleType, state.requiredQuantity),
    [state.bundleType, state.requiredQuantity],
  );

  const customizationIssues = useMemo(
    () => validateCustomization(state.customization),
    [state.customization],
  );

  const canAdvance = useMemo(() => {
    // A new bundle starts from a template. A bundle that already exists may have none (older
    // bundles, or a template that was removed): it must stay editable.
    if (currentStep.id === "template") {
      return (state.templateId !== null || savedId !== null) && quantityError === null;
    }
    if (currentStep.id === "discount") return discountError === null;
    if (currentStep.id === "design") return customizationIssues.length === 0;
    return true;
  }, [
    currentStep.id,
    state.templateId,
    savedId,
    quantityError,
    discountError,
    customizationIssues,
  ]);

  function goNext() {
    if (!canAdvance) return;
    setStepIndex((index) => Math.min(index + 1, WIZARD_STEPS.length - 1));
  }

  function goBack() {
    setStepIndex((index) => Math.max(index - 1, 0));
  }

  async function submit(action: "draft" | "publish") {
    setPending(action);
    setFailure(null);

    const payload = wizardStateToPayload(state, selectedTemplate?.name ?? null);
    const saved = savedId
      ? await apiRequest<{ bundle: { id: string } }>("PATCH", `/api/bundles/${savedId}`, payload)
      : await apiRequest<{ bundle: { id: string } }>("POST", "/api/bundles", payload);

    if (!saved.ok) {
      setFailure({ heading: "Couldn't save the bundle", error: saved.error });
      setPending(null);
      return;
    }

    const id = saved.data.bundle.id;
    setSavedId(id);

    if (action === "publish") {
      const published = await apiRequest("POST", `/api/bundles/${id}/publish`);
      if (!published.ok) {
        setFailure({
          heading: "Saved, but this bundle can't be published yet",
          error: published.error,
        });
        setPending(null);
        return;
      }
    }

    router.push("/dashboard/bundles");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <StepIndicator currentStepIndex={stepIndex} />

      <div className="min-h-72">
        {currentStep.id === "template" ? (
          <div className="space-y-6">
            <TemplateSelector
              templates={templates}
              appliedTemplateId={state.templateId}
              retiredTemplateName={
                selectedTemplate === null && state.templateId !== null ? retiredTemplateName : null
              }
              onApply={(template) => setState((current) => applyTemplate(current, template))}
            />
            <div className="max-w-sm space-y-1.5">
              <Label htmlFor="bundle-title">Bundle name</Label>
              <Input
                id="bundle-title"
                placeholder="Summer Outfit Bundle"
                value={state.title}
                onChange={(event) => setState({ ...state, title: event.target.value })}
              />
            </div>
            <BundleTypeSelector
              bundleType={state.bundleType}
              requiredQuantity={state.requiredQuantity}
              onBundleTypeChange={(bundleType) => setState({ ...state, bundleType })}
              onRequiredQuantityChange={(requiredQuantity) =>
                setState({ ...state, requiredQuantity })
              }
            />
          </div>
        ) : null}

        {currentStep.id === "products" ? (
          <ProductSelector
            value={state.products}
            onChange={(products) => setState({ ...state, products })}
          />
        ) : null}

        {currentStep.id === "discount" ? (
          <DiscountConfigurator
            discountType={state.discountType}
            discountValue={state.discountValue}
            onDiscountTypeChange={(discountType) => setState({ ...state, discountType })}
            onDiscountValueChange={(discountValue) => setState({ ...state, discountValue })}
          />
        ) : null}

        {currentStep.id === "design" ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <CustomizationEditor
              value={state.customization}
              onChange={(customization) => setState({ ...state, customization })}
              onReset={() =>
                setState({
                  ...state,
                  customization: selectedTemplate
                    ? structuredClone(selectedTemplate.defaults.customization)
                    : cloneDefaultCustomization(),
                })
              }
              resetLabel={selectedTemplate ? "Reset to template design" : "Reset to defaults"}
            />
            <div className="lg:sticky lg:top-4 lg:self-start">
              <WidgetPreview state={state} templateName={selectedTemplate?.name ?? null} />
            </div>
          </div>
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
                <dt className="text-muted-foreground text-xs font-medium">Type</dt>
                <dd className="text-foreground text-sm">
                  {state.bundleType === "fixed"
                    ? "Fixed bundle"
                    : `${state.bundleType === "quantity" ? "Quantity bundle" : "Mix & match"} (${state.requiredQuantity} items)`}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs font-medium">Template</dt>
                <dd className="text-foreground text-sm">
                  {selectedTemplate?.name ??
                    (state.templateId
                      ? (retiredTemplateName ?? "An earlier template")
                      : "None (not started from a template)")}
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
                <dd className="text-foreground text-sm">
                  {state.products.length === 0
                    ? "None selected"
                    : `${state.products.length} ${state.products.length === 1 ? "product" : "products"}`}
                  {state.products.some((p) => p.availability === "unavailable") ? (
                    <span className="text-destructive"> · some are no longer available</span>
                  ) : null}
                </dd>
              </div>
            </dl>

            <div className="space-y-2">
              <h3 className="text-foreground text-sm font-semibold">Storefront preview</h3>
              <WidgetPreview state={state} templateName={selectedTemplate?.name ?? null} />
            </div>

            <p className="text-muted-foreground text-sm">
              Publishing is checked on our servers: a bundle needs at least one product, and every
              product must still be active in your Shopify store. Save a draft any time and publish
              when it&apos;s ready.
            </p>

            {failure ? (
              <Alert variant="destructive">
                <AlertTitle>{failure.heading}</AlertTitle>
                <AlertDescription>
                  <p>{failure.error.message}</p>
                  {failure.error.details.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-1 pl-4">
                      {failure.error.details.map((issue) => (
                        <li key={`${issue.field}-${issue.code}`}>{issue.message}</li>
                      ))}
                    </ul>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="border-border flex items-center justify-between border-t pt-4">
        <Button variant="ghost" asChild>
          <Link href="/dashboard/bundles">Cancel</Link>
        </Button>

        <div className="flex items-center gap-2">
          {stepIndex > 0 ? (
            <Button variant="outline" onClick={goBack} disabled={pending !== null}>
              Back
            </Button>
          ) : null}
          {currentStep.id !== "publish" ? (
            <Button onClick={goNext} disabled={!canAdvance}>
              Next
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => submit("draft")} disabled={pending !== null}>
                {pending === "draft" ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : null}
                {isEditing ? "Save changes" : "Save draft"}
              </Button>
              <Button onClick={() => submit("publish")} disabled={pending !== null}>
                {pending === "publish" ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : null}
                Publish
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
