"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { WIZARD_STEPS } from "./types";

export function StepIndicator({ currentStepIndex }: { currentStepIndex: number }) {
  return (
    <ol
      aria-label="Bundle creation steps"
      className="border-border flex flex-wrap gap-x-6 gap-y-3 border-b pb-4"
    >
      {WIZARD_STEPS.map((step, index) => {
        const isComplete = index < currentStepIndex;
        const isCurrent = index === currentStepIndex;

        return (
          <li key={step.id} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                isComplete && "bg-primary text-primary-foreground",
                isCurrent && !isComplete && "bg-primary/10 text-primary ring-primary/30 ring-1",
                !isComplete && !isCurrent && "bg-muted text-muted-foreground",
              )}
            >
              {isComplete ? <Check className="size-3.5" /> : index + 1}
            </span>
            <span
              className={cn(
                "text-sm font-medium",
                isCurrent ? "text-foreground" : "text-muted-foreground",
              )}
              aria-current={isCurrent ? "step" : undefined}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
