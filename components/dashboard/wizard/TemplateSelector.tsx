"use client";

import { Check } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TEMPLATE_CATEGORY_LABEL } from "@/lib/templates/types";
import { describeTemplateDefaults, type WizardTemplate } from "./types";

interface TemplateSelectorProps {
  templates: WizardTemplate[];
  /** The template the bundle currently uses (chosen earlier in this wizard, or saved with the bundle). */
  appliedTemplateId: string | null;
  /** Set when the bundle's saved template is no longer offered: it is named, not selectable. */
  retiredTemplateName?: string | null;
  onApply: (template: WizardTemplate) => void;
}

/**
 * Step 1 of the wizard. Cards preview a template (nothing changes yet); "Use this template"
 * applies its starting values. The preview needs no Shopify data: it shows the template's
 * purpose, the kind of bundle it makes and which kinds of product to pick, using application
 * placeholders only, never product images.
 */
export function TemplateSelector({
  templates,
  appliedTemplateId,
  retiredTemplateName,
  onApply,
}: TemplateSelectorProps) {
  const previewHeadingId = useId();
  const [previewId, setPreviewId] = useState<string | null>(
    templates.some((template) => template.id === appliedTemplateId) ? appliedTemplateId : null,
  );
  const preview = templates.find((template) => template.id === previewId) ?? null;
  const categories = Array.from(new Set(templates.map((template) => template.category)));
  const applied = preview !== null && preview.id === appliedTemplateId;

  if (templates.length === 0) {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        No templates are available right now. Please try again later.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {retiredTemplateName ? (
        <p className="border-border text-muted-foreground rounded-lg border p-3 text-sm">
          This bundle was started from “{retiredTemplateName}”, which is no longer offered. You can
          keep working on it as it is, or choose one of the templates below.
        </p>
      ) : null}

      {categories.map((category) => (
        <div key={category} className="space-y-3">
          <h3 className="text-foreground text-sm font-semibold">
            {TEMPLATE_CATEGORY_LABEL[category]}
          </h3>
          <div
            role="radiogroup"
            aria-label={`${TEMPLATE_CATEGORY_LABEL[category]} templates`}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            {templates
              .filter((template) => template.category === category)
              .map((template) => {
                const selected = template.id === previewId;
                const inUse = template.id === appliedTemplateId;
                return (
                  <button
                    key={template.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setPreviewId(template.id)}
                    className={cn(
                      "flex flex-col gap-1 rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                      "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                      selected
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border text-foreground hover:bg-muted",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2 font-medium">
                      {template.name}
                      {inUse ? (
                        <span className="text-primary inline-flex items-center gap-1 text-xs">
                          <Check className="size-4" aria-hidden="true" />
                          In use
                        </span>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground text-xs font-normal">
                      {template.description}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      ))}

      {preview ? (
        <section
          aria-labelledby={previewHeadingId}
          className="border-border bg-muted/30 space-y-4 rounded-xl border p-4"
        >
          <div className="space-y-1">
            <h3 id={previewHeadingId} className="text-foreground text-base font-semibold">
              {preview.name}
            </h3>
            <p className="text-muted-foreground text-sm">{preview.intendedUse}</p>
          </div>

          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            {describeTemplateDefaults(preview).map((item) => (
              <div key={item.label}>
                <dt className="text-muted-foreground text-xs font-medium">{item.label}</dt>
                <dd className="text-foreground">{item.value}</dd>
              </div>
            ))}
          </dl>

          <div className="space-y-2">
            <h4 className="text-foreground text-sm font-medium">
              What to pick: about {preview.suggestedProductCount} products
            </h4>
            <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {preview.sections.map((section) => (
                <li
                  key={section.key}
                  className="border-border bg-background rounded-lg border border-dashed p-3"
                >
                  <p className="text-foreground text-sm font-medium">{section.label}</p>
                  <p className="text-muted-foreground text-xs">{section.hint}</p>
                </li>
              ))}
            </ol>
            <p className="text-muted-foreground text-xs">
              These are only suggestions. You choose your own products next, and you can change the
              type, discount and design at any time.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={() => onApply(preview)}
              variant={applied ? "outline" : "default"}
            >
              {applied ? "Reset to template defaults" : "Use this template"}
            </Button>
            {applied ? (
              <p role="status" className="text-muted-foreground text-sm">
                Template applied. Continue with Next.
              </p>
            ) : null}
          </div>
        </section>
      ) : (
        <p className="text-muted-foreground text-sm">
          Select a template to see what it is for, then choose “Use this template”.
        </p>
      )}
    </div>
  );
}
