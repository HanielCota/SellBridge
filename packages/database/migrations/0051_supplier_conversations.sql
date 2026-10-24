CREATE TYPE "public"."supplier_conversation_topic" AS ENUM('order', 'return', 'stock_price', 'product', 'other');--> statement-breakpoint
CREATE TYPE "public"."ticket_audience" AS ENUM('platform', 'supplier');--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "audience" "ticket_audience" DEFAULT 'platform' NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "supplier_id" uuid;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "supplier_topic" "supplier_conversation_topic";--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tickets_supplier_idx" ON "tickets" USING btree ("supplier_id","updated_at");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_supplier_topic_check" CHECK (("tickets"."audience" = 'supplier') = ("tickets"."supplier_topic" is not null));