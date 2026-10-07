-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('active', 'draft', 'archived', 'deleted');

-- CreateEnum
CREATE TYPE "CatalogSyncStatus" AS ENUM ('pending', 'syncing', 'partial', 'synced', 'failed');

-- AlterTable
ALTER TABLE "shops" ADD COLUMN     "catalog_sync_cursor" TEXT,
ADD COLUMN     "catalog_sync_error" TEXT,
ADD COLUMN     "catalog_sync_started_at" TIMESTAMP(3),
ADD COLUMN     "catalog_sync_status" "CatalogSyncStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN     "catalog_synced_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "shopify_product_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "status" "ProductStatus" NOT NULL,
    "vendor" TEXT,
    "product_type" TEXT,
    "image_url" TEXT,
    "shopify_updated_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "shopify_variant_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sku" TEXT,
    "price" DECIMAL(12,2),
    "compare_at_price" DECIMAL(12,2),
    "available_for_sale" BOOLEAN NOT NULL,
    "image_url" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "removed_at" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_shop_id_status_idx" ON "products"("shop_id", "status");

-- CreateIndex
CREATE INDEX "products_shop_id_title_idx" ON "products"("shop_id", "title");

-- CreateIndex
CREATE UNIQUE INDEX "products_shop_id_shopify_product_id_key" ON "products"("shop_id", "shopify_product_id");

-- CreateIndex
CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_shop_id_shopify_variant_id_key" ON "product_variants"("shop_id", "shopify_variant_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
