CREATE TABLE "store_suppliers" (
	"store_connection_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_suppliers_store_connection_id_supplier_id_pk" PRIMARY KEY("store_connection_id","supplier_id")
);
--> statement-breakpoint
ALTER TABLE "store_suppliers" ADD CONSTRAINT "store_suppliers_store_connection_id_store_connections_id_fk" FOREIGN KEY ("store_connection_id") REFERENCES "public"."store_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_suppliers" ADD CONSTRAINT "store_suppliers_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "store_suppliers_supplier_idx" ON "store_suppliers" USING btree ("supplier_id");--> statement-breakpoint
-- Each shop keeps the supplier it sells today; shops without one stay pending.
INSERT INTO "store_suppliers" ("store_connection_id", "supplier_id", "created_at")
SELECT "id", "supplier_id", "connected_at" FROM "store_connections" WHERE "supplier_id" IS NOT NULL;
