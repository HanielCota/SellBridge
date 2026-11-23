CREATE TABLE "listing_families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"model_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "family_id" uuid;--> statement-breakpoint
ALTER TABLE "listing_families" ADD CONSTRAINT "listing_families_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_families" ADD CONSTRAINT "listing_families_model_id_product_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."product_models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "listing_families_tenant_model_idx" ON "listing_families" USING btree ("tenant_id","model_id");--> statement-breakpoint
CREATE INDEX "listing_families_model_idx" ON "listing_families" USING btree ("model_id");--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_family_id_listing_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."listing_families"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listings_family_idx" ON "listings" USING btree ("family_id");