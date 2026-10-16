ALTER TYPE "public"."ticket_event_type" ADD VALUE 'order_linked';--> statement-breakpoint
ALTER TYPE "public"."ticket_event_type" ADD VALUE 'order_unlinked';--> statement-breakpoint
ALTER TYPE "public"."ticket_event_type" ADD VALUE 'follower_added';--> statement-breakpoint
CREATE TABLE "ticket_followers" (
	"ticket_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"notify" boolean DEFAULT true NOT NULL,
	"added_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_followers_ticket_id_user_id_pk" PRIMARY KEY("ticket_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "ticket_orders" (
	"ticket_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"linked_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_orders_ticket_id_order_id_pk" PRIMARY KEY("ticket_id","order_id")
);
--> statement-breakpoint
ALTER TABLE "ticket_followers" ADD CONSTRAINT "ticket_followers_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_followers" ADD CONSTRAINT "ticket_followers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_followers" ADD CONSTRAINT "ticket_followers_added_by_id_user_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_linked_by_id_user_id_fk" FOREIGN KEY ("linked_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_orders_order_idx" ON "ticket_orders" USING btree ("order_id");