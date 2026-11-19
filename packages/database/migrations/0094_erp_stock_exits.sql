CREATE TABLE "erp_stock_exits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"supplier_product_id" uuid,
	"erp_product_id" bigint NOT NULL,
	"quantity" integer NOT NULL,
	"sku" text NOT NULL,
	"external_order_id" text NOT NULL,
	"status" text NOT NULL,
	"erp_stock_id" bigint,
	"problem" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "erp_stock_exits_quantity_check" CHECK ("erp_stock_exits"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "supplier_erp_connections" ADD COLUMN "stock_exits_since" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "erp_stock_exits" ADD CONSTRAINT "erp_stock_exits_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_stock_exits" ADD CONSTRAINT "erp_stock_exits_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_stock_exits" ADD CONSTRAINT "erp_stock_exits_supplier_product_id_supplier_products_id_fk" FOREIGN KEY ("supplier_product_id") REFERENCES "public"."supplier_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "erp_stock_exits_order_item_idx" ON "erp_stock_exits" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "erp_stock_exits_posting_idx" ON "erp_stock_exits" USING btree ("created_at") WHERE "erp_stock_exits"."status" = 'posting';--> statement-breakpoint
CREATE INDEX "order_status_changes_status_idx" ON "order_status_changes" USING btree ("status","changed_at");