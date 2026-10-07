-- AlterEnum (additive)
ALTER TYPE "SubscriptionStatus" ADD VALUE 'pending';
ALTER TYPE "SubscriptionStatus" ADD VALUE 'expired';

-- DropIndex: a shop keeps its subscription history, so shop_id is no longer unique
DROP INDEX "subscriptions_shop_id_key";

-- AlterTable (additive columns)
ALTER TABLE "subscriptions" ADD COLUMN     "confirmation_url" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "current_period_end" TIMESTAMP(3),
ADD COLUMN     "is_test" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_shopify_charge_id_key" ON "subscriptions"("shopify_charge_id");

-- CreateIndex
CREATE INDEX "subscriptions_shop_id_status_idx" ON "subscriptions"("shop_id", "status");
