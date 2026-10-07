import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Serializes billing-sensitive work for one shop for the rest of the
 * transaction (released automatically at commit/rollback). Two rapid
 * requests for the same shop queue here instead of racing, which is what
 * stops a double click from creating two charges or two active plans.
 */
export async function lockShopBilling(tx: Prisma.TransactionClient, shopId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`billing:${shopId}`}::text))`;
}
