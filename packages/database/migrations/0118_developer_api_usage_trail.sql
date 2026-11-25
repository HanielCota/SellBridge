ALTER TABLE "developer_api_requests" DROP CONSTRAINT "developer_api_requests_key_id_developer_api_keys_id_fk";
--> statement-breakpoint
ALTER TABLE "developer_api_requests" ALTER COLUMN "key_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "developer_api_requests" ADD COLUMN "key_prefix" text;--> statement-breakpoint
UPDATE "developer_api_requests" SET "key_prefix" = "developer_api_keys"."prefix" FROM "developer_api_keys" WHERE "developer_api_keys"."id" = "developer_api_requests"."key_id";--> statement-breakpoint
ALTER TABLE "developer_api_requests" ALTER COLUMN "key_prefix" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "developer_api_requests" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "developer_api_requests" ADD COLUMN "resource_id" text;--> statement-breakpoint
ALTER TABLE "developer_api_requests" ADD COLUMN "personal_data" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "developer_api_requests" ADD CONSTRAINT "developer_api_requests_key_id_developer_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."developer_api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "developer_api_requests_organization_idx" ON "developer_api_requests" USING btree ("organization_id","created_at");