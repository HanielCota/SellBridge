CREATE TABLE "supplier_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	"revoke_note" text,
	CONSTRAINT "supplier_flags_reason_check" CHECK ("supplier_flags"."reason" in ('product_listing_error', 'stale_catalog', 'slow_support', 'order_error', 'contact_attempt', 'other')),
	CONSTRAINT "supplier_flags_note_check" CHECK (char_length("supplier_flags"."note") <= 500 and ("supplier_flags"."reason" <> 'other' or btrim("supplier_flags"."note") <> '')),
	CONSTRAINT "supplier_flags_expires_check" CHECK ("supplier_flags"."expires_at" = "supplier_flags"."created_at" + interval '2160 hours'),
	CONSTRAINT "supplier_flags_revoke_check" CHECK (("supplier_flags"."revoked_at" is null and "supplier_flags"."revoke_note" is null) or ("supplier_flags"."revoked_at" is not null and "supplier_flags"."revoke_note" is not null and btrim("supplier_flags"."revoke_note") <> '' and char_length("supplier_flags"."revoke_note") <= 500))
);
--> statement-breakpoint
ALTER TABLE "supplier_flags" ADD CONSTRAINT "supplier_flags_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_flags" ADD CONSTRAINT "supplier_flags_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_flags" ADD CONSTRAINT "supplier_flags_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplier_flags_supplier_expires_idx" ON "supplier_flags" USING btree ("supplier_id","expires_at");