ALTER TABLE "tenant_profile" ADD COLUMN "product_source_mode" text;--> statement-breakpoint
ALTER TABLE "tenant_profile" ADD CONSTRAINT "tenant_profile_product_source_mode_check" CHECK ("tenant_profile"."product_source_mode" is null or "tenant_profile"."product_source_mode" in ('own', 'suppliers', 'both'));--> statement-breakpoint
UPDATE "tenant_profile" SET "product_source_mode" = 'suppliers' WHERE "starter_supplier_id" IS NOT NULL;
