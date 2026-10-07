import { bundleNotFound } from "@/lib/bundles/errors";
import { TITLE_MAX_LENGTH } from "@/lib/bundles/rules";
import type { BundleDto } from "@/lib/bundles/types";
import { prisma } from "@/lib/prisma";
import { createBundle } from "./create";
import { bundleInclude, toDraftInput } from "./shared";

const COPY_SUFFIX = " (copy)";

/** Copies a bundle (any status) owned by `shopId` into a new DRAFT. */
export async function duplicateBundle(shopId: string, bundleId: string): Promise<BundleDto> {
  const source = await prisma.bundle.findFirst({
    where: { id: bundleId, shopId },
    include: bundleInclude,
    // One joined statement instead of one round trip per relation.
    relationLoadStrategy: "join",
  });
  if (!source) throw bundleNotFound();

  const input = toDraftInput(source);
  const title = `${input.title.slice(0, TITLE_MAX_LENGTH - COPY_SUFFIX.length)}${COPY_SUFFIX}`;
  return createBundle(shopId, { ...input, title });
}
