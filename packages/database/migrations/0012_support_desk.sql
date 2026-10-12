CREATE TYPE "public"."ticket_category" AS ENUM('order', 'payment', 'store', 'listing', 'account', 'other');--> statement-breakpoint
CREATE TYPE "public"."ticket_event_type" AS ENUM('status_changed', 'assigned', 'priority_changed', 'category_changed', 'rated');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TABLE "ticket_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ticket_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"ticket_id" uuid NOT NULL,
	"actor_id" text,
	"automatic" boolean DEFAULT false NOT NULL,
	"type" "ticket_event_type" NOT NULL,
	"from_value" text,
	"to_value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_reads" (
	"ticket_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"read_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ticket_reads_ticket_id_user_id_pk" PRIMARY KEY("ticket_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "category" "ticket_category" DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "priority" "ticket_priority" DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "assignee_id" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "awaiting_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "first_response_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "rating" smallint;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "rating_comment" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "rated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_reads" ADD CONSTRAINT "ticket_reads_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_reads" ADD CONSTRAINT "ticket_reads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_events_ticket_idx" ON "ticket_events" USING btree ("ticket_id","id");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tickets_queue_idx" ON "tickets" USING btree ("status","assignee_id");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_rating_range" CHECK ("tickets"."rating" between 1 and 5);--> statement-breakpoint
-- Backfill: tickets opened before the support desk get the same clocks new tickets keep.
UPDATE "tickets" t SET "first_response_at" = (
	SELECT min(m."created_at") FROM "ticket_messages" m
	WHERE m."ticket_id" = t."id" AND m."is_admin" AND NOT m."is_internal"
);--> statement-breakpoint
UPDATE "tickets" SET "closed_at" = "updated_at" WHERE "status" = 'closed';--> statement-breakpoint
UPDATE "tickets" t SET "awaiting_since" = coalesce((
	SELECT min(m."created_at") FROM "ticket_messages" m
	WHERE m."ticket_id" = t."id" AND NOT m."is_admin" AND m."created_at" > coalesce((
		SELECT max(r."created_at") FROM "ticket_messages" r
		WHERE r."ticket_id" = t."id" AND r."is_admin" AND NOT r."is_internal"
	), '-infinity'::timestamptz)
), t."updated_at")
WHERE t."status" = 'open';--> statement-breakpoint
-- Everything said before the deploy counts as read, for the reseller who opened the ticket and
-- for everyone already on the team: otherwise every old reply would light up as new.
INSERT INTO "ticket_reads" ("ticket_id", "user_id", "read_at")
SELECT t."id", u."id", now()
FROM "tickets" t
JOIN "user" u ON u."id" = t."created_by_id" OR u."role" IN ('admin', 'supervisor', 'agent')
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Answered tickets already idle past the 7-day window close as of when they would have closed,
-- so the first auto-close run does not stamp them all with the deploy date.
WITH idle AS (
	UPDATE "tickets"
	SET "status" = 'closed', "closed_at" = "updated_at" + interval '7 days', "awaiting_since" = NULL
	WHERE "status" = 'answered' AND "updated_at" < now() - interval '7 days'
	RETURNING "id", "closed_at"
)
INSERT INTO "ticket_events" ("ticket_id", "actor_id", "automatic", "type", "from_value", "to_value", "created_at")
SELECT "id", NULL, true, 'status_changed', 'answered', 'closed', "closed_at" FROM idle;
