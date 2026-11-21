-- Hand-written: these foreign keys were created under generated names longer than 63 bytes,
-- which Postgres stored cut to 63. Renaming from the stored names keeps each constraint and its
-- check; never regenerate this file.
ALTER TABLE "product_grouping_items" RENAME CONSTRAINT "product_grouping_items_supplier_product_id_supplier_products_id" TO "product_grouping_items_product_fk";--> statement-breakpoint
ALTER TABLE "store_buyer_address_checks" RENAME CONSTRAINT "store_buyer_address_checks_store_connection_id_store_connection" TO "store_buyer_address_checks_store_connection_fk";--> statement-breakpoint
ALTER TABLE "supplier_test_orders" RENAME CONSTRAINT "supplier_test_orders_supplier_product_id_supplier_products_id_f" TO "supplier_test_orders_product_fk";--> statement-breakpoint
ALTER TABLE "shipment_payment_checkouts" RENAME CONSTRAINT "shipment_payment_checkouts_shipment_payment_id_shipment_payment" TO "shipment_payment_checkouts_payment_fk";--> statement-breakpoint
ALTER TABLE "marketplace_fee_quotes" RENAME CONSTRAINT "marketplace_fee_quotes_store_connection_id_store_connections_id" TO "marketplace_fee_quotes_store_connection_fk";
