ALTER TABLE "supplier_products" ADD COLUMN "fiscal" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD COLUMN "fiscal_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "fiscal_profile" jsonb;