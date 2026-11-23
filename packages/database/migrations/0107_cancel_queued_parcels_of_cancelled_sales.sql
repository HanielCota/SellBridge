-- Sales a marketplace cancelled before the fix kept their unshipped parcels in the supplier's
-- queue, with the deadline running. They get what a cancellation does now: the parcel is
-- cancelled by SellBridge with the same note. Parcels that already left are not touched. Running
-- it again finds nothing left in the queue, so it changes nothing.
INSERT INTO "shipment_events" ("shipment_id", "status", "actor", "note")
SELECT "order_shipments"."id", 'cancelled', 'SellBridge',
  'Venda cancelada' || CASE "store_connections"."marketplace"
    WHEN 'mercado_livre' THEN ' no Mercado Livre'
    WHEN 'tiktok_shop' THEN ' no TikTok Shop'
    WHEN 'shopee' THEN ' na Shopee'
    ELSE ''
  END || '. Não envie o produto; se já separou, devolva ao estoque.'
FROM "order_shipments"
INNER JOIN "orders" ON "orders"."id" = "order_shipments"."order_id"
INNER JOIN "store_connections" ON "store_connections"."id" = "orders"."store_connection_id"
WHERE "orders"."status" = 'cancelled'
  AND "order_shipments"."status" IN ('forwarded', 'accepted', 'picking', 'ready');
--> statement-breakpoint
UPDATE "order_shipments"
SET "status" = 'cancelled', "updated_at" = now()
FROM "orders"
WHERE "orders"."id" = "order_shipments"."order_id"
  AND "orders"."status" = 'cancelled'
  AND "order_shipments"."status" IN ('forwarded', 'accepted', 'picking', 'ready');
