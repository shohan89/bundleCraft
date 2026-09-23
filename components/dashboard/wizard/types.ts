export type DiscountType = "percentage" | "fixed_amount";
export type CustomizationLayout = "card" | "horizontal" | "vertical";

export interface WizardTemplate {
  id: string;
  name: string;
  category: "fashion" | "beauty";
}

export interface WizardCustomization {
  primaryColor: string;
  buttonColor: string;
  backgroundColor: string;
  layout: CustomizationLayout;
  fontSize: number;
}

export interface WizardState {
  templateId: string | null;
  title: string;
  discountType: DiscountType;
  /** Kept as a string while the user is typing so partial/invalid input doesn't get coerced away. */
  discountValue: string;
  customization: WizardCustomization;
}

export const INITIAL_WIZARD_STATE: WizardState = {
  templateId: null,
  title: "",
  discountType: "percentage",
  discountValue: "",
  customization: {
    primaryColor: "#111827",
    buttonColor: "#111827",
    backgroundColor: "#ffffff",
    layout: "card",
    fontSize: 16,
  },
};

export const WIZARD_STEPS = [
  { id: "template", label: "Template" },
  { id: "products", label: "Products" },
  { id: "discount", label: "Discount" },
  { id: "design", label: "Design" },
  { id: "publish", label: "Review & publish" },
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number]["id"];

export function validateDiscountValue(type: DiscountType, rawValue: string): string | null {
  if (rawValue.trim() === "") return "Enter a discount value.";
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return "Enter a valid number.";
  if (value <= 0) return "Discount must be greater than 0.";
  if (type === "percentage" && value > 100) return "Percentage discount can't exceed 100%.";
  return null;
}
