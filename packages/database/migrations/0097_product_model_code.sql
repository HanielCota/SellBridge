ALTER TABLE "product_models" ADD COLUMN "code" text;--> statement-breakpoint
UPDATE "product_models" SET "code" = 'MODELO-' || "id"::text WHERE "code" IS NULL;--> statement-breakpoint
ALTER TABLE "product_models" ALTER COLUMN "code" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "product_models_supplier_code_idx" ON "product_models" USING btree ("supplier_id","code");
