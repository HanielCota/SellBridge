ALTER TABLE "orders" ADD COLUMN "marketplace_pack_id" text;--> statement-breakpoint
CREATE INDEX "orders_store_pack_idx" ON "orders" USING btree ("store_connection_id","marketplace_pack_id");