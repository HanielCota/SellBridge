CREATE TABLE "developer_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"secret_hash" text NOT NULL,
	"scopes" text[] NOT NULL,
	"created_by_user_id" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "developer_api_rate_limits" (
	"developer_api_key_id" uuid NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"requests" integer NOT NULL,
	CONSTRAINT "developer_api_rate_limits_developer_api_key_id_window_start_pk" PRIMARY KEY("developer_api_key_id","window_start")
);
--> statement-breakpoint
CREATE TABLE "developer_api_requests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"developer_api_key_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"status" integer NOT NULL,
	"duration_milliseconds" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "developer_api_keys" ADD CONSTRAINT "developer_api_keys_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_api_rate_limits" ADD CONSTRAINT "developer_api_rate_limits_developer_api_key_id_developer_api_keys_id_fk" FOREIGN KEY ("developer_api_key_id") REFERENCES "public"."developer_api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_api_requests" ADD CONSTRAINT "developer_api_requests_developer_api_key_id_developer_api_keys_id_fk" FOREIGN KEY ("developer_api_key_id") REFERENCES "public"."developer_api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "developer_api_keys_secret_hash_idx" ON "developer_api_keys" USING btree ("secret_hash");--> statement-breakpoint
CREATE INDEX "developer_api_keys_creator_idx" ON "developer_api_keys" USING btree ("created_by_user_id","created_at");--> statement-breakpoint
CREATE INDEX "developer_api_requests_key_idx" ON "developer_api_requests" USING btree ("developer_api_key_id","created_at");