// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { parseCreateBundleBody, parseUpdateBundleBody } from "./validation";

const VALID_BODY = {
  title: "Summer Outfit",
  bundleType: "fixed",
  discountType: "percentage",
  discountValue: 20,
};

function capture(fn: () => unknown): ApiError {
  try {
    fn();
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error("expected an ApiError");
}

describe("parseCreateBundleBody", () => {
  it("accepts a minimal body and fills defaults", () => {
    const parsed = parseCreateBundleBody(VALID_BODY);
    expect(parsed).toMatchObject({
      title: "Summer Outfit",
      description: null,
      templateId: null,
      requiredQuantity: null,
      products: [],
      customization: null,
    });
  });

  it("rejects a missing title with a 422 VALIDATION_ERROR", () => {
    const { title, ...withoutTitle } = VALID_BODY;
    void title;
    const error = capture(() => parseCreateBundleBody(withoutTitle));
    expect(error.status).toBe(422);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.details?.map((issue) => issue.field)).toContain("title");
  });

  it("rejects an invalid bundle type and discount type with specific codes", () => {
    const error = capture(() =>
      parseCreateBundleBody({ ...VALID_BODY, bundleType: "bogo", discountType: "bogus" }),
    );
    const byField = Object.fromEntries((error.details ?? []).map((i) => [i.field, i.code]));
    expect(byField.bundleType).toBe("INVALID_BUNDLE_TYPE");
    expect(byField.discountType).toBe("INVALID_DISCOUNT");
  });

  it("refuses a client-supplied status so publishing can't be bypassed", () => {
    const error = capture(() => parseCreateBundleBody({ ...VALID_BODY, status: "active" }));
    expect(error.details?.[0]).toMatchObject({ code: "UNKNOWN_FIELD", field: "status" });
    expect(error.details?.[0].message).toContain("publish");
  });

  it("refuses a client-supplied shopId (tenant identity comes from the session only)", () => {
    const error = capture(() => parseCreateBundleBody({ ...VALID_BODY, shopId: "someone-else" }));
    expect(error.details?.[0].code).toBe("UNKNOWN_FIELD");
  });

  it("rejects wrong types and non-objects", () => {
    expect(() => parseCreateBundleBody({ ...VALID_BODY, discountValue: "20" })).toThrow(ApiError);
    expect(() => parseCreateBundleBody(null)).toThrow(ApiError);
    expect(() => parseCreateBundleBody("bundle")).toThrow(ApiError);
  });

  it("rejects a malformed templateId", () => {
    expect(() => parseCreateBundleBody({ ...VALID_BODY, templateId: "not-a-uuid" })).toThrow(
      ApiError,
    );
  });
});

describe("parseUpdateBundleBody", () => {
  it("only includes the keys the client actually sent", () => {
    const patch = parseUpdateBundleBody({ title: "New name" });
    expect(patch).toEqual({ title: "New name" });
    expect("products" in patch).toBe(false);
  });

  it("preserves an explicit null (clearing a field) as distinct from absent", () => {
    expect(parseUpdateBundleBody({ customization: null, description: null })).toEqual({
      customization: null,
      description: null,
    });
  });

  it("refuses status here too", () => {
    const error = capture(() => parseUpdateBundleBody({ status: "active" }));
    expect(error.details?.[0].field).toBe("status");
  });
});
