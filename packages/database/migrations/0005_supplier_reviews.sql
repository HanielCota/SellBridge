CREATE TABLE "supplier_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"order_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_reviews_rating_check" CHECK ("supplier_reviews"."rating" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "supplier_reviews" ADD CONSTRAINT "supplier_reviews_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_reviews" ADD CONSTRAINT "supplier_reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_reviews" ADD CONSTRAINT "supplier_reviews_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_reviews_order_supplier_idx" ON "supplier_reviews" USING btree ("order_id","supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_reviews_supplier_created_idx" ON "supplier_reviews" USING btree ("supplier_id","created_at");--> statement-breakpoint
CREATE INDEX "supplier_reviews_tenant_idx" ON "supplier_reviews" USING btree ("tenant_id");