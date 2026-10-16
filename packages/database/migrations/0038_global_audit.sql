ALTER TABLE "admin_audit_events" DROP CONSTRAINT "admin_audit_events_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "admin_audit_events" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_audit_events" ADD COLUMN "entity_type" text;--> statement-breakpoint
ALTER TABLE "admin_audit_events" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "admin_audit_events" ADD CONSTRAINT "admin_audit_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_events_created_idx" ON "admin_audit_events" USING btree ("created_at");