-- AlterTable
ALTER TABLE "analytics_events" ADD COLUMN     "currency" VARCHAR(3),
ADD COLUMN     "event_key" TEXT,
ADD COLUMN     "order_id" TEXT;

-- CreateIndex
CREATE INDEX "analytics_events_shop_id_event_type_created_at_idx" ON "analytics_events"("shop_id", "event_type", "created_at");

-- CreateIndex
CREATE INDEX "analytics_events_bundle_id_event_type_created_at_idx" ON "analytics_events"("bundle_id", "event_type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_events_shop_id_event_key_key" ON "analytics_events"("shop_id", "event_key");
