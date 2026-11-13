CREATE TYPE "public"."problem_area" AS ENUM('publishing', 'sync', 'orders', 'payments', 'invoices', 'email', 'other');--> statement-breakpoint
CREATE TYPE "public"."problem_service" AS ENUM('web', 'worker');--> statement-breakpoint
CREATE TABLE "problem_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service" "problem_service" NOT NULL,
	"area" "problem_area" NOT NULL,
	"event" text NOT NULL,
	"message" text NOT NULL,
	"fingerprint" text NOT NULL,
	"tenant_id" text,
	"store_connection_id" text,
	"listing_target_id" text,
	"context" jsonb NOT NULL,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_id" text
);
--> statement-breakpoint
ALTER TABLE "problem_events" ADD CONSTRAINT "problem_events_resolved_by_id_user_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "problem_events_last_seen_idx" ON "problem_events" USING btree ("last_seen_at","id");--> statement-breakpoint
CREATE INDEX "problem_events_open_fingerprint_idx" ON "problem_events" USING btree ("fingerprint","last_seen_at") WHERE "problem_events"."resolved_at" is null;