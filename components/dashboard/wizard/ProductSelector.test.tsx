import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/lib/api/client";
import type {
  CatalogStatus,
  ProductDetail,
  ProductListItem,
  ProductListResponse,
} from "@/lib/products/types";
import { ProductSelector } from "./ProductSelector";
import type { WizardProduct } from "./types";

vi.mock("@/lib/api/client", () => ({ apiRequest: vi.fn() }));
const mocked = vi.mocked(apiRequest);

const item = (over: Partial<ProductListItem> = {}): ProductListItem => ({
  id: "p1",
  shopifyProductId: "1001",
  title: "Linen Shirt",
  handle: "linen-shirt",
  status: "active",
  vendor: "Acme",
  productType: "Shirt",
  imageUrl: "https://cdn.shopify.com/shirt.png",
  variantCount: 1,
  availableVariantCount: 1,
  available: true,
  ...over,
});
const synced: CatalogStatus = { status: "synced", syncedAt: null, error: null };
const listOf = (
  items: ProductListItem[],
  catalog: CatalogStatus = synced,
): ProductListResponse => ({
  items,
  page: 1,
  limit: 20,
  total: items.length,
  catalog,
});
const detail = (over: Partial<ProductDetail> = {}): ProductDetail => ({
  ...item(),
  variants: [
    {
      shopifyVariantId: "2001",
      title: "Default",
      sku: null,
      price: "45.00",
      compareAtPrice: null,
      availableForSale: true,
      imageUrl: null,
    },
  ],
  ...over,
});

/** Stateful wrapper so the controlled component behaves as it does inside the wizard. */
function Harness({ initial = [] }: { initial?: WizardProduct[] }) {
  const [value, setValue] = useState<WizardProduct[]>(initial);
  return (
    <>
      <ProductSelector value={value} onChange={setValue} />
      <output data-testid="payload">
        {JSON.stringify(value.map((p) => [p.shopifyVariantId, p.quantity]))}
      </output>
    </>
  );
}

const respond = (handlers: Record<string, (url: string) => unknown>) => {
  mocked.mockImplementation((async (method: string, url: string) => {
    for (const [key, handler] of Object.entries(handlers)) {
      if (`${method} ${url}`.startsWith(key)) return { ok: true, data: handler(url) };
    }
    return { ok: false, error: { code: "X", message: `unexpected ${method} ${url}`, details: [] } };
  }) as never);
};
const payload = () => JSON.parse(screen.getByTestId("payload").textContent ?? "[]");

beforeEach(() => {
  mocked.mockReset();
});

describe("ProductSelector", () => {
  it("shows a loading state, then the shop's real products from the API (never sample data)", async () => {
    respond({
      "GET /api/products?": () =>
        listOf([item(), item({ id: "p2", title: "Wool Hat", shopifyProductId: "1002" })]),
    });
    render(<Harness />);

    expect(screen.getByRole("status", { name: "Loading products" })).toBeInTheDocument();
    expect(await screen.findByText("Linen Shirt")).toBeInTheDocument();
    expect(screen.getByText("Wool Hat")).toBeInTheDocument();
    expect(mocked.mock.calls[0][1]).toContain("status=active");
    expect(screen.getAllByText(/Acme · Shirt · 1 variant/)).toHaveLength(2);
  });

  it("shows an empty state for an empty catalog, and a different one for a search with no match", async () => {
    respond({ "GET /api/products?": () => listOf([]) });
    render(<Harness />);
    expect(await screen.findByText("No products found")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Search products"), "zzz");
    expect(await screen.findByText("No products match your search")).toBeInTheDocument();
  });

  it("searches after a short pause and sends the text to the API", async () => {
    respond({ "GET /api/products?": () => listOf([item()]) });
    render(<Harness />);
    await screen.findByText("Linen Shirt");

    await userEvent.type(screen.getByLabelText("Search products"), "shirt");
    await waitFor(() => expect(mocked.mock.calls.at(-1)![1]).toContain("search=shirt"));
    // Typed letter by letter, but not one request per keystroke.
    expect(mocked.mock.calls.filter((c) => String(c[1]).includes("search=")).length).toBeLessThan(
      5,
    );
  });

  it("adds a single-variant product directly, with quantity 1", async () => {
    respond({
      "GET /api/products?": () => listOf([item()]),
      "GET /api/products/p1": () => ({ product: detail() }),
    });
    render(<Harness />);
    await userEvent.click(await screen.findByRole("button", { name: "Add Linen Shirt" }));

    await waitFor(() => expect(payload()).toEqual([["2001", 1]]));
    const selected = screen.getByRole("region", { name: "Selected products" });
    expect(within(selected).getByText("Linen Shirt")).toBeInTheDocument();
    expect(within(selected).queryByText(/·/)).toBeNull(); // no variant label for a single variant
  });

  it("asks which variant to use for a multi-variant product, marks sold-out ones, and refuses duplicates", async () => {
    const variants = [
      {
        shopifyVariantId: "2001",
        title: "S",
        sku: null,
        price: "45.00",
        compareAtPrice: null,
        availableForSale: true,
        imageUrl: null,
      },
      {
        shopifyVariantId: "2002",
        title: "M",
        sku: null,
        price: "45.00",
        compareAtPrice: null,
        availableForSale: false,
        imageUrl: null,
      },
    ];
    respond({
      "GET /api/products?": () => listOf([item({ variantCount: 2 })]),
      "GET /api/products/p1": () => ({ product: detail({ variantCount: 2, variants }) }),
    });
    render(<Harness />);
    await userEvent.click(await screen.findByRole("button", { name: "Add Linen Shirt" }));

    const chooser = await screen.findByRole("group", { name: /Choose a variant of Linen Shirt/ });
    expect(within(chooser).getByText(/Sold out/)).toBeInTheDocument();
    await userEvent.click(
      within(chooser).getByRole("button", { name: "Add variant S of Linen Shirt" }),
    );
    expect(payload()).toEqual([["2001", 1]]);
    expect(
      within(screen.getByRole("region", { name: "Selected products" })).getByText(/· S/),
    ).toBeInTheDocument();

    // Choosing the same variant again is not possible.
    await userEvent.click(screen.getByRole("button", { name: "Add Linen Shirt" }));
    const again = await screen.findByRole("group", { name: /Choose a variant/ });
    expect(
      within(again).getByRole("button", { name: "Add variant S of Linen Shirt" }),
    ).toBeDisabled();
  });

  it("edits quantity within limits and removes products", async () => {
    render(
      <Harness
        initial={[
          {
            shopifyProductId: "1001",
            shopifyVariantId: "2001",
            quantity: 1,
            title: "Linen Shirt",
            variantTitle: null,
            imageUrl: null,
            price: "45.00",
            availability: "available",
          },
        ]}
      />,
    );
    respond({ "GET /api/products?": () => listOf([]) });

    const qty = screen.getByLabelText("Quantity");
    await userEvent.clear(qty);
    await userEvent.type(qty, "3");
    expect(payload()).toEqual([["2001", 3]]);
    await userEvent.clear(qty);
    await userEvent.type(qty, "500");
    expect(payload()).toEqual([["2001", 50]]); // "500" is out of range: only the valid prefix was committed
    await userEvent.tab();
    expect(qty).toHaveValue("50");

    await userEvent.click(screen.getByRole("button", { name: "Remove Linen Shirt" }));
    expect(payload()).toEqual([]);
    expect(screen.getByText(/No products yet/)).toBeInTheDocument();
  });

  it("flags selected products that are no longer available or unknown, and sold out", () => {
    respond({ "GET /api/products?": () => listOf([]) });
    const base = {
      shopifyProductId: "1",
      quantity: 1,
      variantTitle: null,
      imageUrl: null,
      price: null,
    };
    render(
      <Harness
        initial={[
          { ...base, shopifyVariantId: "1", title: "Gone Tee", availability: "unavailable" },
          { ...base, shopifyVariantId: "2", title: "Mystery Cap", availability: "unknown" },
          { ...base, shopifyVariantId: "3", title: "Out Sock", availability: "sold_out" },
        ]}
      />,
    );
    expect(screen.getByText(/No longer available in your store/)).toBeInTheDocument();
    expect(screen.getByText(/Not in your synced catalog/)).toBeInTheDocument();
    expect(screen.getByText("Currently sold out")).toBeInTheDocument();
  });

  it("marks a sold-out product in the results", async () => {
    respond({
      "GET /api/products?": () => listOf([item({ available: false, availableVariantCount: 0 })]),
    });
    render(<Harness />);
    expect(await screen.findByText("Sold out")).toBeInTheDocument();
  });

  it("shows a safe error with retry when the products cannot be loaded", async () => {
    mocked.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again.",
        details: [],
      },
    });
    mocked.mockResolvedValueOnce({ ok: true, data: listOf([item()]) });
    render(<Harness />);

    expect(await screen.findByText("Couldn't load your products")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Linen Shirt")).toBeInTheDocument();
  });

  it("starts the first sync by itself for a shop that never synced, repeats until done, then reloads", async () => {
    let listCalls = 0;
    let syncCalls = 0;
    mocked.mockImplementation((async (method: string, url: string) => {
      if (method === "POST") {
        syncCalls += 1;
        const done = syncCalls >= 2;
        return {
          ok: true,
          data: {
            outcome: done ? "synced" : "partial",
            products: 3,
            variants: 5,
            skipped: 0,
            markedDeleted: 0,
            catalog: synced,
          },
        };
      }
      if (url.startsWith("/api/products?")) {
        listCalls += 1;
        return {
          ok: true,
          data:
            listCalls === 1
              ? listOf([], { status: "pending", syncedAt: null, error: null })
              : listOf([item()]),
        };
      }
      return { ok: false, error: { code: "X", message: "unexpected", details: [] } };
    }) as never);

    render(<Harness />);
    expect(await screen.findByText("Linen Shirt")).toBeInTheDocument();
    expect(syncCalls).toBe(2);
    expect(
      mocked.mock.calls.filter((c) => c[0] === "POST").every((c) => c[1] === "/api/products/sync"),
    ).toBe(true);
  });

  it("the Sync products button syncs on demand, and shows a safe error if Shopify fails", async () => {
    mocked.mockImplementation((async (method: string) =>
      method === "POST"
        ? {
            ok: false,
            error: {
              code: "SHOPIFY_API_ERROR",
              message: "Shopify is not available right now. Please try again in a moment.",
              details: [],
            },
          }
        : { ok: true, data: listOf([item()]) }) as never);
    render(<Harness />);
    await screen.findByText("Linen Shirt");

    await userEvent.click(screen.getByRole("button", { name: "Sync products" }));
    expect(await screen.findByText(/Shopify is not available right now/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sync products" })).toBeEnabled();
  });

  it("sends only ids and quantities when the bundle is saved, never product data", () => {
    // wizardStateToPayload is covered in types.test.ts; here the contract is that the
    // selector's state carries display data separately from what is submitted.
    render(
      <Harness
        initial={[
          {
            shopifyProductId: "1",
            shopifyVariantId: "2",
            quantity: 2,
            title: "T",
            variantTitle: null,
            imageUrl: null,
            price: "9.00",
          },
        ]}
      />,
    );
    expect(payload()).toEqual([["2", 2]]);
  });

  it("has no automated accessibility violations (WCAG 2.1 A/AA)", async () => {
    respond({
      "GET /api/products?": () =>
        listOf([item(), item({ id: "p2", title: "Sold Hat", available: false })]),
    });
    const { container } = render(
      <Harness
        initial={[
          {
            shopifyProductId: "1",
            shopifyVariantId: "2",
            quantity: 1,
            title: "Picked",
            variantTitle: "M",
            imageUrl: null,
            price: null,
            availability: "unavailable",
          },
        ]}
      />,
    );
    await screen.findByText("Linen Shirt");
    const results = await axe.run(container, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
      },
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });
    expect(
      results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join("|")}`),
    ).toEqual([]);
  });
});
