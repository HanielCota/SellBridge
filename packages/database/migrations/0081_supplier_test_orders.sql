CREATE TABLE "supplier_test_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"supplier_product_id" uuid,
	"product_title" text NOT NULL,
	"product_sku" text NOT NULL,
	"step" text DEFAULT 'received' NOT NULL,
	"dispatch_deadline_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"label_printed_at" timestamp with time zone,
	"picked_at" timestamp with time zone,
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_test_orders_step_check" CHECK ("supplier_test_orders"."step" in ('received','accepted','label_printed','picked','shipped','delivered'))
);
--> statement-breakpoint
ALTER TABLE "supplier_test_orders" ADD CONSTRAINT "supplier_test_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_test_orders" ADD CONSTRAINT "supplier_test_orders_supplier_product_id_supplier_products_id_fk" FOREIGN KEY ("supplier_product_id") REFERENCES "public"."supplier_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_test_orders_supplier_idx" ON "supplier_test_orders" USING btree ("supplier_id");