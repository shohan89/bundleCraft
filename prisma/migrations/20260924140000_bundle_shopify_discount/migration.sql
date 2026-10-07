-- AlterTable
ALTER TABLE "bundles" ADD COLUMN     "discount_synced_at" TIMESTAMP(3),
ADD COLUMN     "shopify_discount_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "bundles_shopify_discount_id_key" ON "bundles"("shopify_discount_id");
