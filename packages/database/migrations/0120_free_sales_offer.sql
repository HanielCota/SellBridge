ALTER TABLE "billing_courtesies" DROP CONSTRAINT "billing_courtesies_plan_check";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "free_sale_slot" smallint;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_tenant_free_sale_slot_idx" ON "orders" USING btree ("tenant_id","free_sale_slot") WHERE "orders"."free_sale_slot" is not null;--> statement-breakpoint
ALTER TABLE "billing_courtesies" ADD CONSTRAINT "billing_courtesies_plan_check" CHECK ("billing_courtesies"."plan" in ('essential', 'start', 'pro', 'business', 'black', 'elite'));--> statement-breakpoint
WITH ranked_sales AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "tenant_id" ORDER BY coalesce("paid_at", "ordered_at"), "created_at", "id"
  ) AS slot
  FROM "orders"
  WHERE "paid_at" IS NOT NULL OR "status" IN ('paid', 'shipped', 'delivered')
)
UPDATE "orders" AS existing
SET "free_sale_slot" = ranked_sales.slot::smallint
FROM ranked_sales
WHERE existing."id" = ranked_sales."id" AND ranked_sales.slot <= 20;
