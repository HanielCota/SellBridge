CREATE TABLE "report_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"owner_id" text NOT NULL,
	"month" text NOT NULL,
	"payload" jsonb NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "report_snapshots_owner_month_idx" ON "report_snapshots" USING btree ("scope","owner_id","month");