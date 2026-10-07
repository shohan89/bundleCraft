import {
  alreadyActive,
  bundleNotFound,
  cannotPublish,
  concurrentModification,
  invalidTransition,
} from "@/lib/bundles/errors";
import { buildDiscountConfig } from "@/lib/discounts/config";
import { canDeactivate, canPublish, validateBundleForPublish } from "@/lib/bundles/rules";
import type { BundleDto } from "@/lib/bundles/types";
import { prisma } from "@/lib/prisma";
import { assertActiveBundleCapacity } from "@/services/billing/access";
import { checkCatalogProducts } from "@/services/products/validate";
import { disableBundleDiscount, enableBundleDiscount } from "@/services/discounts/sync";
import { bundleInclude, mapPersistenceError, toBundleDto, toDraftInput } from "./shared";

/**
 * The only way a bundle becomes ACTIVE. Loads the bundle scoped to
 * `shopId` and validates the stored state server-side, then makes the
 * Shopify checkout discount exist and match it (ACTION-007), and only then
 * flips the status with a compare-and-set. Works for draft -> active and
 * inactive -> active (re-activation is re-validated and re-synced too).
 *
 * The discount comes first on purpose: a bundle must never be advertised
 * on the storefront before checkout can honour its price. The Shopify call
 * happens outside the database transaction so a slow API never holds a
 * connection; the transaction then re-validates and checks the bundle still
 * matches what was synced, and if anything changed (or the flip fails) the
 * discount is switched back off. Every step is idempotent, so a failed
 * publish can simply be retried.
 *
 * Plans: the shop's plan may cap how many bundles are active at once
 * (lib/billing/plans.ts); at the cap this fails with PLAN_LIMIT_REACHED.
 */
export async function publishBundle(shopId: string, bundleId: string): Promise<BundleDto> {
  try {
    const existing = await prisma.bundle.findFirst({
      where: { id: bundleId, shopId },
      include: bundleInclude,
      // One joined statement instead of one round trip per relation.
      relationLoadStrategy: "join",
    });
    if (!existing) throw bundleNotFound();
    if (existing.status === "active") throw alreadyActive();
    if (!canPublish(existing.status)) {
      throw invalidTransition("This bundle can't be published from its current status.");
    }
    const issues = validateBundleForPublish(toDraftInput(existing));
    if (issues.length > 0) throw cannotPublish(issues);

    // Every product must still be a live product of THIS shop in Shopify's synced catalog
    // (not deleted, draft or archived; the variant not removed).
    const catalogIssues = await checkCatalogProducts(shopId, existing.bundleProducts, {
      requireBuyable: true,
    });
    if (catalogIssues.length > 0) throw cannotPublish(catalogIssues);

    // Plan limit (ACTION-009). Checked before Shopify is touched, and again under a lock
    // in the transaction below, so a Free shop can't slip a second bundle in concurrently.
    await assertActiveBundleCapacity(shopId);

    const synced = await enableBundleDiscount(shopId, existing);

    try {
      const row = await prisma.$transaction(async (tx) => {
        const fresh = await tx.bundle.findFirst({
          where: { id: bundleId, shopId },
          include: bundleInclude,
          // One joined statement instead of one round trip per relation.
          relationLoadStrategy: "join",
        });
        if (!fresh) throw bundleNotFound();
        if (fresh.status !== existing.status) throw concurrentModification();
        await assertActiveBundleCapacity(shopId, tx);
        const freshIssues = validateBundleForPublish(toDraftInput(fresh));
        if (freshIssues.length > 0) throw cannotPublish(freshIssues);
        // Edited while the discount was being synced? Then Shopify holds stale rules.
        const current = JSON.stringify(buildDiscountConfig(fresh, synced.config.currencyCode));
        if (current !== JSON.stringify(synced.config)) throw concurrentModification();

        const { count } = await tx.bundle.updateMany({
          where: { id: bundleId, shopId, status: existing.status },
          data: { status: "active", discountSyncedAt: new Date() },
        });
        if (count === 0) throw concurrentModification();

        return tx.bundle.findUniqueOrThrow({
          where: { id: bundleId },
          include: bundleInclude,
          relationLoadStrategy: "join",
        });
      });
      return toBundleDto(row);
    } catch (error) {
      // Not published, so checkout must not discount it either. Unless a concurrent
      // publish won the race: then the bundle is active and owns this same discount,
      // which must stay on. Best effort: the failure being reported is the original one.
      const now = await prisma.bundle
        .findFirst({ where: { id: bundleId, shopId }, select: { status: true } })
        .catch(() => null);
      if (now?.status !== "active") {
        await disableBundleDiscount(shopId, bundleId).catch(() => undefined);
      }
      throw error;
    }
  } catch (error) {
    throw mapPersistenceError(error);
  }
}

/**
 * ACTIVE -> INACTIVE. Never deletes; the merchant can edit and re-publish
 * later. The Shopify discount is switched off first: if that fails the
 * bundle stays active and the merchant can simply retry, instead of ending
 * up inactive while checkout still discounts it.
 */
export async function deactivateBundle(shopId: string, bundleId: string): Promise<BundleDto> {
  try {
    const existing = await prisma.bundle.findFirst({
      where: { id: bundleId, shopId },
      select: { status: true },
    });
    if (!existing) throw bundleNotFound();
    if (!canDeactivate(existing.status)) {
      throw invalidTransition("Only active bundles can be deactivated.");
    }

    await disableBundleDiscount(shopId, bundleId);

    const row = await prisma.$transaction(async (tx) => {
      const { count } = await tx.bundle.updateMany({
        where: { id: bundleId, shopId, status: "active" },
        data: { status: "inactive", discountSyncedAt: new Date() },
      });
      if (count === 0) throw concurrentModification();

      return tx.bundle.findUniqueOrThrow({
        where: { id: bundleId },
        include: bundleInclude,
        relationLoadStrategy: "join",
      });
    });
    return toBundleDto(row);
  } catch (error) {
    throw mapPersistenceError(error);
  }
}
