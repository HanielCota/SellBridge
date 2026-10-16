ALTER TABLE "billing_accounts" ALTER COLUMN "last_event_created" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "listing_targets" ADD CONSTRAINT "listing_targets_attempts_check" CHECK ("listing_targets"."attempts" >= 0);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_check" CHECK ("order_items"."quantity" > 0);--> statement-breakpoint
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_size_check" CHECK ("ticket_attachments"."size_bytes" >= 0);--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_attempts_check" CHECK ("webhook_deliveries"."attempts" >= 0);