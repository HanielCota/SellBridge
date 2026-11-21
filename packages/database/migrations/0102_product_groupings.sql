CREATE TABLE "product_grouping_items" (
	"grouping_id" uuid NOT NULL,
	"supplier_product_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category_id" uuid,
	"image_urls" text[] NOT NULL,
	"mercado_livre_attributes" jsonb NOT NULL,
	"mercado_livre_category_id" text,
	"mercado_livre_category_name" text,
	"warranty_type" text,
	"warranty_days" integer,
	"video_url" text,
	"made_to_order_days" integer,
	"carrier_only" boolean NOT NULL,
	"fiscal" jsonb NOT NULL,
	CONSTRAINT "product_grouping_items_grouping_id_supplier_product_id_pk" PRIMARY KEY("grouping_id","supplier_product_id")
);
--> statement-breakpoint
CREATE TABLE "product_groupings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"model_id" uuid,
	"grouped_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"separated_at" timestamp with time zone,
	"separated_by" text,
	CONSTRAINT "product_groupings_separated_check" CHECK (("product_groupings"."separated_at" is null) = ("product_groupings"."separated_by" is null))
);
--> statement-breakpoint
ALTER TABLE "product_grouping_items" ADD CONSTRAINT "product_grouping_items_grouping_id_product_groupings_id_fk" FOREIGN KEY ("grouping_id") REFERENCES "public"."product_groupings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_grouping_items" ADD CONSTRAINT "product_grouping_items_supplier_product_id_supplier_products_id_fk" FOREIGN KEY ("supplier_product_id") REFERENCES "public"."supplier_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_grouping_items" ADD CONSTRAINT "product_grouping_items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_groupings" ADD CONSTRAINT "product_groupings_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_groupings" ADD CONSTRAINT "product_groupings_model_id_product_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."product_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_grouping_items_product_idx" ON "product_grouping_items" USING btree ("supplier_product_id");--> statement-breakpoint
CREATE INDEX "product_groupings_supplier_idx" ON "product_groupings" USING btree ("supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_groupings_model_idx" ON "product_groupings" USING btree ("model_id") WHERE "product_groupings"."model_id" is not null;