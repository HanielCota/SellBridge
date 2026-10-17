CREATE TABLE "terms_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_profile" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "tenant_profile" ADD COLUMN "cnpj" text;--> statement-breakpoint
ALTER TABLE "tenant_profile" ADD COLUMN "company_name" text;--> statement-breakpoint
ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "terms_acceptances_user_version_idx" ON "terms_acceptances" USING btree ("user_id","version");