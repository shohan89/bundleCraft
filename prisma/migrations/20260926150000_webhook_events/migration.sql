-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('processing', 'processed', 'failed');

-- AlterTable
ALTER TABLE "shops" ADD COLUMN     "uninstalled_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "topic" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "resource_id" TEXT,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'processing',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "last_error" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "webhook_events_status_updated_at_idx" ON "webhook_events"("status", "updated_at");

-- CreateIndex
CREATE INDEX "webhook_events_shop_id_created_at_idx" ON "webhook_events"("shop_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_shop_id_topic_event_id_key" ON "webhook_events"("shop_id", "topic", "event_id");

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
