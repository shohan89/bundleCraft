"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * UI shell only — there's no Shopify product-fetching API yet (that's a
 * later action). The search input is real, wired local state; results are
 * intentionally an honest empty state rather than fabricated products.
 */
export function ProductSelector() {
  const [query, setQuery] = useState("");

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
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

      <EmptyState
        icon={Search}
        title="Product search isn't connected yet"
        description="Selecting products from your store will be available once product syncing is set up. You can continue through the rest of the wizard in the meantime."
      />
    </div>
  );
}
