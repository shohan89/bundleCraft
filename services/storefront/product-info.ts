import { toNumericId, type StorefrontVariant } from "@/lib/storefront/types";
import { prisma } from "@/lib/prisma";

export interface VariantInfo {
  variantId: string;
  productTitle: string;
  imageUrl: string | null;
  /** The chosen variant plus its sibling variants, for the widget's variant picker. */
  variants: StorefrontVariant[];
}

/**
 * Display data for the storefront widget, read from the shop's SYNCED catalog
 * (services/products), never from Shopify per page view: a page full of widgets
 * costs one indexed database read and no Shopify API calls, and no access token is
 * involved. Shopify stays the source of truth: product webhooks and the catalog
 * sync keep these rows current.
 *
 * Scoped by shop id, so a variant id from another store resolves to nothing.
 *
 * Availability: a variant is `available` only when its product is ACTIVE and the
 * variant is buyable. A deleted, draft or archived product, or a variant Shopify
 * removed, is reported unavailable (never dropped), so the widget shows it as sold
 * out and the authoritative cart check refuses it. A variant that is not in the
 * catalog at all (not synced yet) is simply absent, and callers fall back to the
 * configured variant with no display data, as before.
 */
export async function getVariantInfo(
  shop: { id: string },
  variantIds: string[],
): Promise<Map<string, VariantInfo>> {
  const wanted = [...new Set(variantIds.map(toNumericId))];
  const result = new Map<string, VariantInfo>();
  if (wanted.length === 0) return result;

  // ONE joined statement: each wanted variant with its product and that product's buyable
  // variants (for the widget's variant picker). No follow-up lookups.
  const chosen = await prisma.productVariant.findMany({
    where: { shopId: shop.id, shopifyVariantId: { in: wanted } },
    relationLoadStrategy: "join",
    include: {
      product: {
        include: { variants: { where: { removedAt: null }, orderBy: { position: "asc" } } },
      },
    },
  });
  if (chosen.length === 0) return result;

  for (const row of chosen) {
    const live = row.product.status === "active";
    const toVariant = (v: {
      shopifyVariantId: string;
      title: string;
      price: { toFixed(digits: number): string } | null;
      availableForSale: boolean;
      removedAt?: Date | null;
    }): StorefrontVariant => ({
      id: v.shopifyVariantId,
      title: v.title,
      price: v.price?.toFixed(2) ?? null,
      available: live && v.availableForSale && !v.removedAt,
    });

    const variants = row.product.variants.map(toVariant);
    // The configured variant is always present, even if Shopify has since removed it.
    if (!variants.some((v) => v.id === row.shopifyVariantId)) variants.unshift(toVariant(row));

    result.set(row.shopifyVariantId, {
      variantId: row.shopifyVariantId,
      productTitle: row.product.title,
      imageUrl: row.imageUrl ?? row.product.imageUrl,
      variants,
    });
  }
  return result;
}

export type VariantAvailability = "available" | "sold_out" | "unavailable";

export interface VariantSummary {
  productTitle: string;
  imageUrl: string | null;
  price: string | null;
  availability: VariantAvailability;
}

/**
 * Minimal display data for landing-page cards: ONE indexed query for every configured
 * variant of every listed bundle (no sibling variants, no per-bundle lookups). Same
 * availability rule as getVariantInfo, but split so a card can say "sold out" (live product,
 * no stock) apart from "unavailable" (deleted, draft, archived, or removed variant).
 * A variant missing from the catalog is absent from the result.
 */
export async function getVariantSummaries(
  shop: { id: string },
  variantIds: string[],
): Promise<Map<string, VariantSummary>> {
  const wanted = [...new Set(variantIds.map(toNumericId))];
  const result = new Map<string, VariantSummary>();
  if (wanted.length === 0) return result;

  const rows = await prisma.productVariant.findMany({
    where: { shopId: shop.id, shopifyVariantId: { in: wanted } },
    relationLoadStrategy: "join",
    select: {
      shopifyVariantId: true,
      price: true,
      availableForSale: true,
      removedAt: true,
      imageUrl: true,
      product: { select: { title: true, status: true, imageUrl: true } },
    },
  });
  for (const row of rows) {
    const live = row.product.status === "active" && !row.removedAt;
    result.set(row.shopifyVariantId, {
      productTitle: row.product.title,
      imageUrl: row.imageUrl ?? row.product.imageUrl,
      price: row.price?.toFixed(2) ?? null,
      availability: !live ? "unavailable" : row.availableForSale ? "available" : "sold_out",
    });
  }
  return result;
}
