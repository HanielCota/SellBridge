ALTER TABLE "listing_targets" ADD COLUMN "pause_reason" text;--> statement-breakpoint
-- Paused publications get the reason by elimination, the rules of the code that paused them:
-- the seller asked (or archived the product), the supplier took it off sale, the store sells
-- another supplier now; what is left was paused when its store was disconnected.
UPDATE "listing_targets" AS target
SET "pause_reason" = CASE
  WHEN target."pause_requested" AND supplier."catalog_kind" = 'seller' AND NOT product."active" THEN 'product_archived'
  WHEN target."pause_requested" THEN 'seller'
  WHEN NOT (product."active" AND product."review_status" = 'approved' AND supplier."active") THEN 'supplier_unavailable'
  WHEN NOT (
    (supplier."catalog_kind" = 'seller' AND supplier."owner_tenant_id" = target."tenant_id")
    OR (supplier."catalog_kind" = 'supplier' AND (
      NOT EXISTS (SELECT 1 FROM "store_suppliers" AS chosen WHERE chosen."store_connection_id" = target."store_connection_id")
      OR EXISTS (SELECT 1 FROM "store_suppliers" AS chosen WHERE chosen."store_connection_id" = target."store_connection_id" AND chosen."supplier_id" = supplier."id")
    ))
  ) THEN 'store_supplier_changed'
  ELSE 'store_disconnected'
END
FROM "listings" AS listing
INNER JOIN "supplier_products" AS product ON product."id" = listing."supplier_product_id"
INNER JOIN "suppliers" AS supplier ON supplier."id" = product."supplier_id"
WHERE listing."id" = target."listing_id" AND target."status" = 'paused';
