DROP INDEX "erp_stock_exits_order_item_idx";--> statement-breakpoint
ALTER TABLE "erp_stock_exits" ADD COLUMN "operation" text DEFAULT 'exit' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "erp_stock_exits_order_item_operation_idx" ON "erp_stock_exits" USING btree ("order_item_id","operation");--> statement-breakpoint
ALTER TABLE "erp_stock_exits" ADD CONSTRAINT "erp_stock_exits_operation_check" CHECK ("erp_stock_exits"."operation" in ('exit','entry'));