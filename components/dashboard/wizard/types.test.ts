import { describe, expect, it } from "vitest";
import { validateDiscountValue } from "./types";

describe("validateDiscountValue", () => {
  it("rejects empty input", () => {
    expect(validateDiscountValue("percentage", "")).not.toBeNull();
  });

  it("rejects non-numeric input", () => {
    expect(validateDiscountValue("percentage", "abc")).not.toBeNull();
  });

  it("rejects zero or negative values", () => {
    expect(validateDiscountValue("percentage", "0")).not.toBeNull();
    expect(validateDiscountValue("fixed_amount", "-5")).not.toBeNull();
  });

  it("rejects a percentage over 100", () => {
    expect(validateDiscountValue("percentage", "150")).not.toBeNull();
  });

  it("accepts a valid percentage", () => {
    expect(validateDiscountValue("percentage", "20")).toBeNull();
  });

  it("accepts a fixed amount over 100 (no upper bound for fixed_amount)", () => {
    expect(validateDiscountValue("fixed_amount", "150")).toBeNull();
  });

  it("accepts a valid fixed amount", () => {
    expect(validateDiscountValue("fixed_amount", "30")).toBeNull();
  });
});
