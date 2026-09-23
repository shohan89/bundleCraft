import type { WizardState } from "./types";

function formatDiscount(state: WizardState): string {
  const value = Number(state.discountValue);
  if (!Number.isFinite(value) || value <= 0) return "No discount set";
  return state.discountType === "percentage" ? `${value}% off` : `Save $${value}`;
}

/**
 * Storefront widget preview for the review step. Purely visual — this is
 * not the real storefront widget (that's ACTION-006), just a preview of
 * how the customization choices will look.
 */
export function BundlePreview({
  state,
  templateName,
}: {
  state: WizardState;
  templateName: string | null;
}) {
  const { customization } = state;
  const isHorizontal = customization.layout === "horizontal";

  return (
    <div
      className="border-border rounded-xl border p-4"
      style={{ backgroundColor: customization.backgroundColor }}
    >
      <div
        className={isHorizontal ? "flex items-center justify-between gap-4" : "space-y-3"}
        style={{ fontSize: customization.fontSize, color: customization.primaryColor }}
      >
        <div>
          <p className="font-semibold">{state.title || templateName || "Untitled bundle"}</p>
          <p className="text-sm opacity-80">{formatDiscount(state)}</p>
        </div>
        <button
          type="button"
          disabled
          className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
          style={{ backgroundColor: customization.buttonColor }}
        >
          Add bundle
        </button>
      </div>
    </div>
  );
}
