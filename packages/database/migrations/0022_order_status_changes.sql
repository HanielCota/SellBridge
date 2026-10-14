CREATE TABLE "order_status_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"order_id" uuid NOT NULL,
	"status" "order_status" NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_status_changes" ADD CONSTRAINT "order_status_changes_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_changes" ADD CONSTRAINT "order_status_changes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_status_changes_order_idx" ON "order_status_changes" USING btree ("order_id","changed_at");--> statement-breakpoint
-- Backfill from the public API events still kept: the sale at its order date, then each change.
INSERT INTO "order_status_changes" ("tenant_id", "order_id", "status", "changed_at")
SELECT "orders"."tenant_id",
	"orders"."id",
	("api_events"."data" ->> 'status')::"order_status",
	CASE WHEN "api_events"."type" = 'order.created' THEN "orders"."ordered_at" ELSE "api_events"."created_at" END
FROM "api_events"
INNER JOIN "orders" ON "orders"."id"::text = "api_events"."data" ->> 'orderId'
	AND "orders"."tenant_id" = "api_events"."tenant_id"
WHERE "api_events"."type" IN ('order.created', 'order.status_changed')
	AND "api_events"."data" ->> 'status' IN (SELECT unnest(enum_range(NULL::"order_status"))::text);
