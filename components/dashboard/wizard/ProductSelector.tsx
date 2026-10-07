"use client";

import { Package, RefreshCw, Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ErrorState } from "@/components/dashboard/ErrorState";
import type { WizardProduct } from "@/components/dashboard/wizard/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/api/client";
import { MAX_PRODUCT_QUANTITY } from "@/lib/bundles/rules";
import type {
  CatalogSyncResponse,
  ProductDetail,
  ProductListItem,
  ProductListResponse,
} from "@/lib/products/types";

/** The API syncs for about 20 s per call; this bounds how many calls one click can chain. */
const MAX_SYNC_CALLS = 30;
const SEARCH_DEBOUNCE_MS = 300;

interface ProductSelectorProps {
  value: WizardProduct[];
  onChange: (products: WizardProduct[]) => void;
}

/**
 * A whole number from 1 to MAX_PRODUCT_QUANTITY. The text is kept locally while typing
 * (so the field can be emptied and retyped) and only valid numbers reach the parent; on
 * leaving the field it snaps back to the committed value.
 */
function QuantityInput({
  id,
  value,
  onCommit,
}: {
  id: string;
  value: number;
  onCommit: (quantity: number) => void;
}) {
  const [text, setText] = useState(String(value));
  return (
    <Input
      id={id}
      inputMode="numeric"
      className="w-20"
      value={text}
      onChange={(event) => {
        const next = event.target.value.replace(/\D/g, "").slice(0, 3);
        setText(next);
        const quantity = Number(next);
        if (next !== "" && quantity >= 1 && quantity <= MAX_PRODUCT_QUANTITY) onCommit(quantity);
      }}
      onBlur={() => setText(String(value))}
    />
  );
}

const price = (value: string | null) => (value ? `$${value}` : null);

/**
 * Picks products from the shop's SYNCED Shopify catalog (never free text and never
 * sample data). Everything shown comes from the product API, which is scoped to the
 * signed-in shop; only ids and quantities are sent back when the bundle is saved, and
 * the server checks them again against the same catalog.
 */
export function ProductSelector({ value, onChange }: ProductSelectorProps) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [list, setList] = useState<ProductListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  // Kept apart from `error`: reloading the list afterwards must not erase why the sync failed.
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncedCount, setSyncedCount] = useState(0);
  const [choosing, setChoosing] = useState<{
    product: ProductListItem;
    detail: ProductDetail;
  } | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const autoSyncStarted = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Only the latest request may update the list (typing quickly must not show stale results).
  const latest = useRef(0);
  const load = useCallback(async (search: string) => {
    const ticket = ++latest.current;
    const params = new URLSearchParams({ status: "active", limit: "20" });
    if (search) params.set("search", search);
    const result = await apiRequest<ProductListResponse>("GET", `/api/products?${params}`);
    if (ticket !== latest.current) return;
    if (!result.ok) {
      setError(result.error.message);
      setList(null);
    } else {
      setError(null);
      setList(result.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(debounced), 0);
    return () => clearTimeout(timer);
  }, [debounced, load]);

  const sync = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    setSyncedCount(0);
    for (let call = 0; call < MAX_SYNC_CALLS; call++) {
      const result = await apiRequest<CatalogSyncResponse>("POST", "/api/products/sync");
      if (!result.ok) {
        setSyncError(result.error.message);
        break;
      }
      setSyncedCount((count) => count + result.data.products);
      if (result.data.outcome === "synced") break;
      if (result.data.outcome === "already_running") {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    setSyncing(false);
    await load(debounced);
  }, [debounced, load]);

  // A shop that has never synced (or was reset by a reinstall) starts its first sync by itself.
  const status = list?.catalog.status;
  useEffect(() => {
    if (autoSyncStarted.current || (status !== "pending" && status !== "partial")) return;
    autoSyncStarted.current = true;
    const timer = setTimeout(() => void sync(), 0);
    return () => clearTimeout(timer);
  }, [status, sync]);

  const isSelected = (variantId: string) => value.some((p) => p.shopifyVariantId === variantId);

  function add(product: ProductListItem, variant: ProductDetail["variants"][number]) {
    if (isSelected(variant.shopifyVariantId)) return;
    onChange([
      ...value,
      {
        shopifyProductId: product.shopifyProductId,
        shopifyVariantId: variant.shopifyVariantId,
        quantity: 1,
        title: product.title,
        variantTitle: product.variantCount > 1 ? variant.title : null,
        imageUrl: variant.imageUrl ?? product.imageUrl,
        price: variant.price,
        availability: variant.availableForSale ? "available" : "sold_out",
      },
    ]);
    setChoosing(null);
  }

  async function choose(product: ProductListItem) {
    setAdding(product.id);
    setError(null);
    const result = await apiRequest<{ product: ProductDetail }>(
      "GET",
      `/api/products/${product.id}`,
    );
    setAdding(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    const { variants } = result.data.product;
    if (variants.length === 1) add(product, variants[0]);
    else setChoosing({ product, detail: result.data.product });
  }

  const empty = list !== null && list.items.length === 0;
  const neverSynced = status === "pending" || status === "partial" || status === "failed";

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1 space-y-1.5">
            <Label htmlFor="product-search">Search products</Label>
            <div className="relative">
              <Search
                className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                aria-hidden="true"
              />
              <Input
                id="product-search"
                placeholder="Search your Shopify products…"
                className="pl-8"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </div>
          <Button variant="outline" onClick={() => void sync()} disabled={syncing}>
            <RefreshCw className={syncing ? "animate-spin" : undefined} aria-hidden="true" />
            {syncing ? "Syncing…" : "Sync products"}
          </Button>
        </div>

        <div role="status" aria-live="polite">
          {syncing ? (
            <Alert>
              <AlertDescription>
                Syncing your products from Shopify
                {syncedCount > 0 ? ` (${syncedCount} so far)` : ""}…
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        {syncError ? (
          <ErrorState
            title="Couldn't sync your products"
            message={syncError}
            onRetry={() => void sync()}
          />
        ) : null}

        {error ? (
          <ErrorState
            title="Couldn't load your products"
            message={error}
            onRetry={() => {
              setLoading(true);
              void load(debounced);
            }}
          />
        ) : null}

        {loading && !error ? (
          <div className="space-y-2" role="status" aria-label="Loading products">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : null}

        {empty && !syncing && !error && !syncError ? (
          <EmptyState
            icon={Package}
            title={debounced ? "No products match your search" : "No products found"}
            description={
              debounced
                ? "Try a different search."
                : neverSynced
                  ? "Sync your products from Shopify to choose them for a bundle."
                  : "Only active Shopify products can be added to a bundle. Add a product in Shopify, then sync."
            }
          />
        ) : null}

        {list && list.items.length > 0 ? (
          <ul
            className="border-border divide-border divide-y rounded-xl border"
            aria-label="Products"
          >
            {list.items.map((product) => (
              <li key={product.id} className="flex items-center gap-3 px-3 py-2.5">
                {product.imageUrl ? (
                  // Shopify CDN thumbnails; alt is empty because the title is right beside it.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.imageUrl}
                    alt=""
                    className="size-10 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="bg-muted size-10 shrink-0 rounded-md" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-foreground truncate text-sm font-medium">{product.title}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {[product.vendor, product.productType].filter(Boolean).join(" · ") ||
                      "No vendor"}
                    {" · "}
                    {product.variantCount} {product.variantCount === 1 ? "variant" : "variants"}
                  </p>
                </div>
                {!product.available ? <Badge variant="outline">Sold out</Badge> : null}
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Add ${product.title}`}
                  disabled={adding !== null}
                  onClick={() => void choose(product)}
                >
                  {adding === product.id ? "Adding…" : "Add"}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}

        {list && list.total > list.items.length ? (
          <p className="text-muted-foreground text-xs">
            Showing {list.items.length} of {list.total}. Search to find a specific product.
          </p>
        ) : null}
      </div>

      {choosing ? (
        <fieldset className="border-border space-y-3 rounded-xl border p-4">
          <legend className="text-foreground px-1 text-sm font-semibold">
            Choose a variant of {choosing.product.title}
          </legend>
          <div className="space-y-2">
            {choosing.detail.variants.map((variant) => (
              <div
                key={variant.shopifyVariantId}
                className="flex items-center justify-between gap-3"
              >
                <span className="text-sm">
                  {variant.title}
                  {price(variant.price) ? (
                    <span className="text-muted-foreground"> · {price(variant.price)}</span>
                  ) : null}
                  {!variant.availableForSale ? (
                    <span className="text-muted-foreground"> · Sold out</span>
                  ) : null}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Add variant ${variant.title} of ${choosing.product.title}`}
                  disabled={isSelected(variant.shopifyVariantId)}
                  onClick={() => add(choosing.product, variant)}
                >
                  {isSelected(variant.shopifyVariantId) ? "Added" : "Add"}
                </Button>
              </div>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setChoosing(null)}>
            Cancel
          </Button>
        </fieldset>
      ) : null}

      <section className="space-y-3" aria-label="Selected products">
        <h3 className="text-foreground text-sm font-semibold">
          Selected products ({value.length})
        </h3>
        {value.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No products yet. Add at least one to publish the bundle; you can save a draft without
            any.
          </p>
        ) : (
          <ul className="border-border divide-border divide-y rounded-xl border">
            {value.map((product, index) => (
              <li
                key={product.shopifyVariantId}
                className="flex flex-wrap items-center gap-3 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-foreground truncate text-sm font-medium">
                    {product.title}
                    {product.variantTitle ? (
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        · {product.variantTitle}
                      </span>
                    ) : null}
                  </p>
                  {product.availability === "unavailable" || product.availability === "unknown" ? (
                    <p className="text-destructive text-xs">
                      {product.availability === "unknown"
                        ? "Not in your synced catalog. Remove it or sync your products."
                        : "No longer available in your store. Remove or replace it before publishing."}
                    </p>
                  ) : product.availability === "sold_out" ? (
                    <p className="text-muted-foreground text-xs">Currently sold out</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`qty-${product.shopifyVariantId}`} className="text-xs">
                    Quantity
                  </Label>
                  <QuantityInput
                    id={`qty-${product.shopifyVariantId}`}
                    value={product.quantity}
                    onCommit={(quantity) =>
                      onChange(value.map((p, i) => (i === index ? { ...p, quantity } : p)))
                    }
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${product.title}`}
                    onClick={() => onChange(value.filter((_, i) => i !== index))}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
