ALTER TABLE "orders" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "orders_tenant_sale_date_idx" ON "orders" USING btree ("tenant_id",coalesce("paid_at", "ordered_at"));--> statement-breakpoint
-- Each order that ever counted as a sale takes the first time its history shows it paid, shipped
-- or delivered. Orders older than that history (0022) take their order date when their status
-- says they were paid; a cancelled order without history keeps no payment date (dated by its order).
UPDATE "orders" AS "o"
SET "paid_at" = "first"."paid_at"
FROM (
  SELECT "o2"."id", COALESCE(
    (
      SELECT min("c"."changed_at") FROM "order_status_changes" AS "c"
      WHERE "c"."order_id" = "o2"."id" AND "c"."status" IN ('paid', 'shipped', 'delivered')
    ),
    CASE WHEN "o2"."status" IN ('paid', 'shipped', 'delivered', 'returned') THEN "o2"."ordered_at" END
  ) AS "paid_at"
  FROM "orders" AS "o2"
) AS "first"
WHERE "first"."id" = "o"."id" AND "first"."paid_at" IS NOT NULL;
--> statement-breakpoint
-- A payment is never dated before the order it pays.
UPDATE "orders" SET "paid_at" = "ordered_at" WHERE "paid_at" < "ordered_at";
