-- ACTION-016: two indexes on analytics_events are strict prefixes of other indexes, so no query
-- can need them and every event insert paid to maintain them.
--   analytics_events_shop_id_idx      (shop_id)    <- prefix of (shop_id, event_type, created_at)
--                                                     and of the unique (shop_id, event_key)
--   analytics_events_bundle_id_idx    (bundle_id)  <- prefix of (bundle_id, event_type, created_at)
-- EXPLAIN on 150,000 events showed the same plans and timings without them (per-bundle totals
-- and the bundle-delete cascade now use the composite), and 5.1 MB less index per 150,000 rows.
-- No table data changes; the indexes can be recreated at any time.

-- DropIndex
DROP INDEX "analytics_events_shop_id_idx";

-- DropIndex
DROP INDEX "analytics_events_bundle_id_idx";
