ALTER TABLE "supplier_products" ADD COLUMN "mercado_livre_attributes" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "listing_targets" ADD COLUMN "creation_started_at" timestamp with time zone;
