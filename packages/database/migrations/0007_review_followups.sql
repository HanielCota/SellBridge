CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
UPDATE "orders" SET "delivered_at" = "ordered_at" WHERE "status" = 'delivered';--> statement-breakpoint
ALTER TABLE "notification_reads" DROP CONSTRAINT "notification_reads_pkey";--> statement-breakpoint
ALTER TABLE "notification_reads" ADD COLUMN "tenant_id" text;--> statement-breakpoint
INSERT INTO "notification_reads" ("user_id", "tenant_id", "seen_at", "cleared_at")
SELECT r."user_id", m."organization_id", r."seen_at", r."cleared_at"
FROM "notification_reads" r
JOIN "member" m ON m."user_id" = r."user_id"
WHERE r."tenant_id" IS NULL;--> statement-breakpoint
DELETE FROM "notification_reads" WHERE "tenant_id" IS NULL;--> statement-breakpoint
ALTER TABLE "notification_reads" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_user_id_tenant_id_pk" PRIMARY KEY("user_id","tenant_id");--> statement-breakpoint
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
DELETE FROM "session" WHERE "user_id" IN (SELECT "id" FROM "user" WHERE "role" = 'admin' AND "email_verified" = false);--> statement-breakpoint
UPDATE "user" SET "role" = 'user' WHERE "role" = 'admin' AND "email_verified" = false;
