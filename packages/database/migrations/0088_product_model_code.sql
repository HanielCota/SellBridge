ALTER TABLE "product_models" ADD COLUMN "code" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "product_models_supplier_code_idx" ON "product_models" USING btree ("supplier_id","code");