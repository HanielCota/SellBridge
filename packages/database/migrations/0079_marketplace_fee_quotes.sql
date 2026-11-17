CREATE TABLE "marketplace_fee_quotes" (
	"store_connection_id" uuid NOT NULL,
	"quote_key" text NOT NULL,
	"amount" integer NOT NULL,
	"read_at" timestamp with time zone NOT NULL,
	CONSTRAINT "marketplace_fee_quotes_store_connection_id_quote_key_pk" PRIMARY KEY("store_connection_id","quote_key")
);
--> statement-breakpoint
ALTER TABLE "marketplace_fee_quotes" ADD CONSTRAINT "marketplace_fee_quotes_store_connection_id_store_connections_id_fk" FOREIGN KEY ("store_connection_id") REFERENCES "public"."store_connections"("id") ON DELETE cascade ON UPDATE no action;