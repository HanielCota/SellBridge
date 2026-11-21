ALTER TYPE "public"."customer_issue_kind" ADD VALUE 'courtesy';--> statement-breakpoint
CREATE TABLE "billing_courtesies" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"plan" text NOT NULL,
	"expires_at" timestamp with time zone,
	"reason" text NOT NULL,
	"granted_by" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_courtesies_plan_check" CHECK ("billing_courtesies"."plan" in ('start', 'pro', 'business', 'black', 'elite'))
);
--> statement-breakpoint
ALTER TABLE "billing_courtesies" ADD CONSTRAINT "billing_courtesies_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_courtesies" ADD CONSTRAINT "billing_courtesies_granted_by_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;