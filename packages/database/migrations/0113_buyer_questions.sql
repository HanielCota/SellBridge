CREATE TABLE "buyer_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"store_connection_id" uuid NOT NULL,
	"listing_target_id" uuid NOT NULL,
	"marketplace" "marketplace" NOT NULL,
	"external_question_id" text NOT NULL,
	"external_item_id" text NOT NULL,
	"text" text NOT NULL,
	"status" text NOT NULL,
	"asked_at" timestamp with time zone NOT NULL,
	"answer_text" text,
	"answered_at" timestamp with time zone,
	"answered_by_user_id" text,
	"answer_sending_since" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buyer_questions_status_check" CHECK ("buyer_questions"."status" in ('unanswered','answered','closed','under_review','removed'))
);
--> statement-breakpoint
ALTER TABLE "buyer_questions" ADD CONSTRAINT "buyer_questions_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_questions" ADD CONSTRAINT "buyer_questions_store_connection_id_store_connections_id_fk" FOREIGN KEY ("store_connection_id") REFERENCES "public"."store_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_questions" ADD CONSTRAINT "buyer_questions_listing_target_id_listing_targets_id_fk" FOREIGN KEY ("listing_target_id") REFERENCES "public"."listing_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_questions" ADD CONSTRAINT "buyer_questions_answered_by_user_id_user_id_fk" FOREIGN KEY ("answered_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "buyer_questions_external_idx" ON "buyer_questions" USING btree ("marketplace","external_question_id");--> statement-breakpoint
CREATE INDEX "buyer_questions_tenant_status_idx" ON "buyer_questions" USING btree ("tenant_id","status","asked_at");--> statement-breakpoint
CREATE INDEX "buyer_questions_store_waiting_idx" ON "buyer_questions" USING btree ("store_connection_id") WHERE "buyer_questions"."status" = 'unanswered';