ALTER TABLE "orders" ADD COLUMN "reversed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "orders_tenant_reversed_idx" ON "orders" USING btree ("tenant_id","reversed_at") WHERE "orders"."reversed_at" is not null;--> statement-breakpoint
-- Each paid order that is cancelled or returned now takes the first time its history shows it so
-- after the payment. Orders whose history lacks that step take their payment date: the sale and
-- its reversal stay in the same period, as the reports counted them before.
UPDATE "orders" AS "o"
SET "reversed_at" = GREATEST(
  "o"."paid_at",
  COALESCE(
    (
      SELECT min("c"."changed_at") FROM "order_status_changes" AS "c"
      WHERE "c"."order_id" = "o"."id" AND "c"."status" IN ('cancelled', 'returned')
        AND "c"."changed_at" >= "o"."paid_at"
    ),
    "o"."paid_at"
  )
)
WHERE "o"."paid_at" IS NOT NULL AND "o"."status" IN ('cancelled', 'returned');
