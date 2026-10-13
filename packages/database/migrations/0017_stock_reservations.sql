CREATE TYPE "public"."order_item_stock_state" AS ENUM('untracked', 'pending', 'reserved', 'consumed', 'short', 'released');--> statement-breakpoint
ALTER TABLE "supplier_products" ADD COLUMN "reserved_stock" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Hand-edited: items sold before reservations existed start as 'untracked', so a later sync of
-- an old order never holds, takes or gives back stock the admin already counted by hand. New
-- items default to 'pending'.
ALTER TABLE "order_items" ADD COLUMN "stock_state" "order_item_stock_state" DEFAULT 'untracked' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "stock_state" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_reserved_stock_check" CHECK ("supplier_products"."reserved_stock" >= 0);
