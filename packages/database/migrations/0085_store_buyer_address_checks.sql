CREATE TYPE "public"."buyer_address_result" AS ENUM('ok', 'supplier_address', 'shipping_address', 'no_buying_address', 'not_checked');--> statement-breakpoint
CREATE TABLE "store_buyer_address_checks" (
	"store_connection_id" uuid PRIMARY KEY NOT NULL,
	"result" "buyer_address_result" NOT NULL,
	"supplier_id" uuid,
	"checked_at" timestamp with time zone NOT NULL,
	"wrong_since" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "store_buyer_address_checks" ADD CONSTRAINT "store_buyer_address_checks_store_connection_id_store_connections_id_fk" FOREIGN KEY ("store_connection_id") REFERENCES "public"."store_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_buyer_address_checks" ADD CONSTRAINT "store_buyer_address_checks_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "store_buyer_address_checks_checked_idx" ON "store_buyer_address_checks" USING btree ("checked_at");