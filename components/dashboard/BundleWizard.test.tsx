import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BundleWizard } from "./BundleWizard";
import { templateFixture } from "@/lib/templates/testing";
import { INITIAL_WIZARD_STATE } from "./wizard/types";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/bundles/create",
  useRouter: () => ({ push, refresh }),
}));

const TEMPLATES = [
  templateFixture("complete-look", "t1"),
  templateFixture("skincare-routine", "t2"),
];

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

const fetchMock = vi.fn();

beforeEach(() => {
  push.mockClear();
  refresh.mockClear();
  fetchMock.mockReset();
  // The product step loads the (empty, synced) catalog; everything else goes to the test's own mock.
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
    String(url).startsWith("/api/products")
      ? Promise.resolve(
          jsonResponse(200, {
            success: true,
            data: {
              items: [],
              page: 1,
              limit: 20,
              total: 0,
              catalog: { status: "synced", syncedAt: null, error: null },
            },
          }),
        )
      : fetchMock(url, init),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

type User = ReturnType<typeof userEvent.setup>;

/** Preview a template, then apply it (choosing a card alone changes nothing). */
async function chooseTemplate(user: User, name: RegExp = /Complete Look/) {
  await user.click(screen.getByRole("radio", { name }));
  await user.click(screen.getByRole("button", { name: /Use this template/ }));
}

async function goToReview(user: User) {
  await chooseTemplate(user);
  await user.click(screen.getByRole("button", { name: "Next" })); // Products
  await user.click(screen.getByRole("button", { name: "Next" })); // Discount
  await user.clear(screen.getByLabelText("Percentage off")); // the template pre-fills 15
  await user.type(screen.getByLabelText("Percentage off"), "20");
  await user.click(screen.getByRole("button", { name: "Next" })); // Design
  await user.click(screen.getByRole("button", { name: "Next" })); // Publish
}

describe("BundleWizard navigation and validation", () => {
  it("starts on the Template step with Next disabled until a template is chosen", async () => {
    const user = userEvent.setup();
    render(<BundleWizard templates={TEMPLATES} />);

    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: /Complete Look/ }));
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled(); // previewing is not choosing
    await user.click(screen.getByRole("button", { name: /Use this template/ }));
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("requires a valid required quantity for quantity and mix & match bundles", async () => {
    const user = userEvent.setup();
    render(<BundleWizard templates={TEMPLATES} />);

    await chooseTemplate(user);
    await user.click(screen.getByRole("radio", { name: "Quantity" }));
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    await user.type(screen.getByLabelText("Required quantity"), "0");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByText(/whole number from 1 to/)).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Required quantity"));
    await user.type(screen.getByLabelText("Required quantity"), "3");
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("advances through steps via Next and back via Back, keeping choices", async () => {
    const user = userEvent.setup();
    render(<BundleWizard templates={TEMPLATES} />);

    await chooseTemplate(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("No products found")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("radio", { name: /Complete Look/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("blocks advancing past the Discount step until a valid value is entered", async () => {
    const user = userEvent.setup();
    render(<BundleWizard templates={TEMPLATES} />);

    await chooseTemplate(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    // The template's starting discount is filled in and can be removed or changed.
    expect(screen.getByLabelText("Percentage off")).toHaveValue("15");
    await user.clear(screen.getByLabelText("Percentage off"));
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await user.type(screen.getByLabelText("Percentage off"), "20");
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();

    await user.clear(screen.getByLabelText("Percentage off"));
    await user.type(screen.getByLabelText("Percentage off"), "150");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByText("Percentage discount can't exceed 100%.")).toBeInTheDocument();
  });

  it("Cancel links back to the bundles list", () => {
    render(<BundleWizard templates={TEMPLATES} />);
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      "/dashboard/bundles",
    );
  });
});

describe("BundleWizard saving through the bundle API", () => {
  it("Save draft POSTs the wizard data with the CSRF header, then returns to the list", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, { success: true, data: { bundle: { id: "b1" } } }),
    );
    const user = userEvent.setup();
    render(<BundleWizard templates={TEMPLATES} />);
    await goToReview(user);

    await user.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/bundles"));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/bundles");
    expect(init.method).toBe("POST");
    expect(init.headers["x-requested-with"]).toBe("bundlecraft");
    expect(JSON.parse(init.body)).toMatchObject({
      title: "Complete Look",
      bundleType: "fixed",
      templateId: "t1",
      requiredQuantity: null,
      discountType: "percentage",
      discountValue: 20,
    });
    expect(JSON.parse(init.body)).not.toHaveProperty("status");
    expect(JSON.parse(init.body)).not.toHaveProperty("shopId");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows a loading state and disables the buttons while saving", async () => {
    let finish: (response: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<BundleWizard templates={TEMPLATES} />);
    await goToReview(user);

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();

    finish(jsonResponse(201, { success: true, data: { bundle: { id: "b1" } } }));
    await waitFor(() => expect(push).toHaveBeenCalled());
  });

  it("shows the server's validation errors when publish is rejected, without redirecting", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(201, { success: true, data: { bundle: { id: "b1" } } }))
      .mockResolvedValueOnce(
        jsonResponse(422, {
          success: false,
          error: {
            code: "BUNDLE_CANNOT_BE_PUBLISHED",
            message: "This bundle isn't ready to publish yet.",
            details: [
              {
                field: "products",
                code: "INVALID_PRODUCT",
                message: "Add at least one product before publishing.",
              },
            ],
          },
        }),
      );
    const user = userEvent.setup();
    render(<BundleWizard templates={TEMPLATES} />);
    await goToReview(user);

    await user.click(screen.getByRole("button", { name: "Publish" }));

    expect(
      await screen.findByText("Saved, but this bundle can't be published yet"),
    ).toBeInTheDocument();
    expect(screen.getByText("Add at least one product before publishing.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[1][0]).toBe("/api/bundles/b1/publish");
  });

  it("retrying after a failed publish updates the saved bundle instead of creating a second one", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(201, { success: true, data: { bundle: { id: "b1" } } }))
      .mockResolvedValueOnce(
        jsonResponse(422, {
          success: false,
          error: { code: "BUNDLE_CANNOT_BE_PUBLISHED", message: "Not ready." },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { bundle: { id: "b1" } } }));
    const user = userEvent.setup();
    render(<BundleWizard templates={TEMPLATES} />);
    await goToReview(user);

    await user.click(screen.getByRole("button", { name: "Publish" }));
    await screen.findByText("Not ready.");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(fetchMock.mock.calls[2][0]).toBe("/api/bundles/b1");
    expect(fetchMock.mock.calls[2][1].method).toBe("PATCH");
  });

  it("shows a safe message when the server can't be reached", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    render(<BundleWizard templates={TEMPLATES} />);
    await goToReview(user);

    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByText(/Couldn't reach the server/)).toBeInTheDocument();
    expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("in edit mode, saves with PATCH to the existing bundle", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { success: true, data: { bundle: { id: "b9" } } }),
    );
    const user = userEvent.setup();
    render(
      <BundleWizard
        templates={TEMPLATES}
        bundleId="b9"
        initialState={{
          ...INITIAL_WIZARD_STATE,
          templateId: "t1",
          title: "Existing",
          discountValue: "15",
        }}
      />,
    );
    // Next through the steps with the pre-filled values.
    for (let i = 0; i < 4; i++) await user.click(screen.getByRole("button", { name: "Next" }));

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/bundles/b9");
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      title: "Existing",
      discountValue: 15,
    });
  });
});
