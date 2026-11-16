ALTER TABLE "supplier_products" ADD COLUMN "warranty_type" text;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD COLUMN "warranty_days" integer;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD COLUMN "video_url" text;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD COLUMN "made_to_order_days" integer;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD COLUMN "carrier_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_sale_terms_check" CHECK (("supplier_products"."warranty_type" is null or "supplier_products"."warranty_type" in ('none', 'seller', 'factory')) and ("supplier_products"."warranty_days" is null or "supplier_products"."warranty_days" between 1 and 3650) and ("supplier_products"."made_to_order_days" is null or "supplier_products"."made_to_order_days" between 1 and 60));