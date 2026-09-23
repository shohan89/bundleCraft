"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WizardTemplate } from "./types";

interface TemplateSelectorProps {
  templates: WizardTemplate[];
  selectedTemplateId: string | null;
  onSelect: (templateId: string) => void;
}

const CATEGORY_LABEL: Record<WizardTemplate["category"], string> = {
  fashion: "Fashion",
  beauty: "Beauty",
};

export function TemplateSelector({
  templates,
  selectedTemplateId,
  onSelect,
}: TemplateSelectorProps) {
  const categories = Array.from(new Set(templates.map((template) => template.category)));

  return (
    <div className="space-y-6">
      {categories.map((category) => (
        <div key={category} className="space-y-3">
          <h3 className="text-foreground text-sm font-semibold">{CATEGORY_LABEL[category]}</h3>
          <div
            role="radiogroup"
            aria-label={`${CATEGORY_LABEL[category]} templates`}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            {templates
              .filter((template) => template.category === category)
              .map((template) => {
                const selected = template.id === selectedTemplateId;
                return (
                  <button
                    key={template.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onSelect(template.id)}
                    className={cn(
                      "flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors",
                      "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                      selected
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border text-foreground hover:bg-muted",
                    )}
                  >
                    {template.name}
                    {selected ? <Check className="text-primary size-4" aria-hidden="true" /> : null}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
