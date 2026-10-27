ALTER TABLE "tickets" ADD COLUMN "situation_id" text;--> statement-breakpoint
CREATE INDEX "ticket_events_type_created_idx" ON "ticket_events" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "ticket_messages_created_idx" ON "ticket_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tickets_created_idx" ON "tickets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tickets_subject_idx" ON "tickets" USING btree ("tenant_id","category","situation_id","created_at");