ALTER TABLE "order_shipments" ADD COLUMN "buyer_token_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "order_shipments_buyer_token_idx" ON "order_shipments" USING btree ("buyer_token_hash");