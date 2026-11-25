CREATE TABLE "developer_entry_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"key_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"product_ids" uuid[] NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by_user_id" text,
	"claimed_tenant_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "developer_entry_links" ADD CONSTRAINT "developer_entry_links_key_id_developer_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."developer_api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_entry_links" ADD CONSTRAINT "developer_entry_links_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_entry_links" ADD CONSTRAINT "developer_entry_links_claimed_by_user_id_user_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_entry_links" ADD CONSTRAINT "developer_entry_links_claimed_tenant_id_organization_id_fk" FOREIGN KEY ("claimed_tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "developer_entry_links_token_hash_idx" ON "developer_entry_links" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "developer_entry_links_key_idx" ON "developer_entry_links" USING btree ("key_id","created_at");