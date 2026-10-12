CREATE TYPE "public"."customer_issue_kind" AS ENUM('store', 'listings', 'ticket', 'onboarding', 'cooling');--> statement-breakpoint
CREATE TABLE "admin_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" text,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_issue_triage" (
	"user_id" text NOT NULL,
	"issue_kind" "customer_issue_kind" NOT NULL,
	"assignee_id" text,
	"snoozed_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_issue_triage_user_id_issue_kind_pk" PRIMARY KEY("user_id","issue_kind")
);
--> statement-breakpoint
CREATE TABLE "user_activity" (
	"user_id" text PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_audit_events" ADD CONSTRAINT "admin_audit_events_admin_id_user_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_events" ADD CONSTRAINT "admin_audit_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_issue_triage" ADD CONSTRAINT "customer_issue_triage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_issue_triage" ADD CONSTRAINT "customer_issue_triage_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity" ADD CONSTRAINT "user_activity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_events_user_idx" ON "admin_audit_events" USING btree ("user_id","created_at");--> statement-breakpoint
-- Seed the last sign-in from the sessions still on record; auth timestamps are stored in UTC.
INSERT INTO "user_activity" ("user_id", "last_seen_at")
SELECT "user_id", max("updated_at") AT TIME ZONE 'UTC'
FROM "session"
WHERE "impersonated_by" IS NULL
GROUP BY "user_id";
