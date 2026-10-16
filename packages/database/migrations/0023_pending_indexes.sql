-- Trigram search on the catalog. `sellbridge_fold` is lower(unaccent(text)) declared IMMUTABLE
-- (unaccent with its dictionary named is stable in practice), which an expression index needs.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE OR REPLACE FUNCTION sellbridge_fold(value text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, value)) $$;--> statement-breakpoint
CREATE INDEX "supplier_products_title_trgm_idx" ON "supplier_products" USING gin (sellbridge_fold("title") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "supplier_products_sku_trgm_idx" ON "supplier_products" USING gin (sellbridge_fold("sku") gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "store_connections_live_shop_idx" ON "store_connections" USING btree ("marketplace","external_shop_id") WHERE "store_connections"."status" <> 'disconnected';--> statement-breakpoint
CREATE INDEX "listing_targets_store_external_idx" ON "listing_targets" USING btree ("store_connection_id","external_id");--> statement-breakpoint
CREATE INDEX "listings_tenant_product_idx" ON "listings" USING btree ("tenant_id","supplier_product_id");--> statement-breakpoint
CREATE INDEX "listings_product_idx" ON "listings" USING btree ("supplier_product_id");--> statement-breakpoint
CREATE INDEX "order_items_tenant_order_idx" ON "order_items" USING btree ("tenant_id","order_id");--> statement-breakpoint
CREATE INDEX "webhook_events_received_idx" ON "webhook_events" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "api_events_created_idx" ON "api_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_event_idx" ON "webhook_deliveries" USING btree ("event_id");