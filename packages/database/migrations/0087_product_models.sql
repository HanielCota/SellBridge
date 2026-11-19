CREATE TABLE "product_model_colors" (
	"model_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"image_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "product_model_colors_model_id_name_pk" PRIMARY KEY("model_id","name")
);
--> statement-breakpoint
CREATE TABLE "product_model_sizes" (
	"model_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "product_model_sizes_model_id_name_pk" PRIMARY KEY("model_id","name")
);
--> statement-breakpoint
CREATE TABLE "product_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"category_id" uuid,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"mercado_livre_attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"mercado_livre_category_id" text,
	"mercado_livre_category_name" text,
	"warranty_type" text,
	"warranty_days" integer,
	"video_url" text,
	"made_to_order_days" integer,
	"carrier_only" boolean DEFAULT false NOT NULL,
	"fiscal" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_models_sale_terms_check" CHECK (("product_models"."warranty_type" is null or "product_models"."warranty_type" in ('none', 'seller', 'factory')) and ("product_models"."warranty_days" is null or "product_models"."warranty_days" between 1 and 3650) and ("product_models"."made_to_order_days" is null or "product_models"."made_to_order_days" between 1 and 60))
);
--> statement-breakpoint
ALTER TABLE "supplier_products" ADD COLUMN "model_id" uuid;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD COLUMN "size" text;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD COLUMN "variant_attributes" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD COLUMN "variant_fiscal" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "product_model_colors" ADD CONSTRAINT "product_model_colors_model_id_product_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."product_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_model_sizes" ADD CONSTRAINT "product_model_sizes_model_id_product_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."product_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_models" ADD CONSTRAINT "product_models_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_models" ADD CONSTRAINT "product_models_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_models_supplier_idx" ON "product_models" USING btree ("supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_models_id_supplier_idx" ON "product_models" USING btree ("id","supplier_id");--> statement-breakpoint
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_model_fk" FOREIGN KEY ("model_id","supplier_id") REFERENCES "public"."product_models"("id","supplier_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_model_color_fk" FOREIGN KEY ("model_id","color") REFERENCES "public"."product_model_colors"("model_id","name") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_model_size_fk" FOREIGN KEY ("model_id","size") REFERENCES "public"."product_model_sizes"("model_id","name") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_products_model_combination_idx" ON "supplier_products" USING btree ("model_id",coalesce("color", ''),coalesce("size", '')) WHERE "supplier_products"."model_id" is not null;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_model_combination_check" CHECK (("supplier_products"."model_id" is null and "supplier_products"."color" is null and "supplier_products"."size" is null and "supplier_products"."variant_attributes" = '{}'::jsonb and "supplier_products"."variant_fiscal" = '{}'::jsonb) or ("supplier_products"."model_id" is not null and ("supplier_products"."color" is not null or "supplier_products"."size" is not null)));