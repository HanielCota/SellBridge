CREATE TABLE "erp_stock_refresh_requests" (
	"supplier_id" uuid NOT NULL,
	"erp_product_id" bigint NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "erp_stock_refresh_requests_supplier_id_erp_product_id_pk" PRIMARY KEY("supplier_id","erp_product_id")
);
--> statement-breakpoint
ALTER TABLE "supplier_products" ADD COLUMN "erp_product_id" bigint;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD COLUMN "erp_stock_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "supplier_erp_connections" ADD COLUMN "erp_company_id" text;--> statement-breakpoint
ALTER TABLE "supplier_erp_connections" ADD COLUMN "stock_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "supplier_erp_connections" ADD COLUMN "stock_check_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_erp_connections" ADD COLUMN "last_stock_notice_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "erp_stock_refresh_requests" ADD CONSTRAINT "erp_stock_refresh_requests_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplier_products_erp_product_idx" ON "supplier_products" USING btree ("supplier_id","erp_product_id") WHERE "supplier_products"."erp_product_id" is not null;--> statement-breakpoint
CREATE INDEX "supplier_erp_connections_company_idx" ON "supplier_erp_connections" USING btree ("provider","erp_company_id");