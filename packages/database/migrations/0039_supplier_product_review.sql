CREATE TYPE "public"."supplier_product_review_status" AS ENUM('draft', 'in_review', 'approved', 'rejected');--> statement-breakpoint
ALTER TABLE "supplier_products" ADD COLUMN "review_status" "supplier_product_review_status" DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD COLUMN "rejection_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD COLUMN "reviewed_by" text;--> statement-breakpoint
CREATE INDEX "supplier_products_review_status_idx" ON "supplier_products" USING btree ("supplier_id","review_status");--> statement-breakpoint
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_rejection_reasons_check" CHECK ("supplier_products"."review_status" <> 'rejected' or jsonb_array_length("supplier_products"."rejection_reasons") > 0);