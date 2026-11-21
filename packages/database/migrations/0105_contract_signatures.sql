CREATE TABLE "contract_signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text,
	"user_id" text,
	"profile_kind" text NOT NULL,
	"contract_version" text NOT NULL,
	"contract_hash" text NOT NULL,
	"confirmed_item_ids" jsonb NOT NULL,
	"signer_identity_enc" text NOT NULL,
	"ip_address_enc" text,
	"user_agent" text,
	"device_type" text NOT NULL,
	"browser" text NOT NULL,
	"time_zone" text NOT NULL,
	"verification_method" text DEFAULT 'email_code' NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_signatures_profile_kind_check" CHECK ("contract_signatures"."profile_kind" in ('seller', 'supplier')),
	CONSTRAINT "contract_signatures_hash_check" CHECK ("contract_signatures"."contract_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "contract_signatures_verification_method_check" CHECK ("contract_signatures"."verification_method" in ('email_code'))
);
--> statement-breakpoint
CREATE TABLE "contract_signing_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"profile_kind" text NOT NULL,
	"contract_version" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_signing_codes_profile_kind_check" CHECK ("contract_signing_codes"."profile_kind" in ('seller', 'supplier')),
	CONSTRAINT "contract_signing_codes_attempts_check" CHECK ("contract_signing_codes"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "contract_signing_required_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contract_signatures" ADD CONSTRAINT "contract_signatures_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_signatures" ADD CONSTRAINT "contract_signatures_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_signing_codes" ADD CONSTRAINT "contract_signing_codes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_signing_codes" ADD CONSTRAINT "contract_signing_codes_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contract_signatures_tenant_version_idx" ON "contract_signatures" USING btree ("tenant_id","profile_kind","contract_version") WHERE "contract_signatures"."tenant_id" is not null;--> statement-breakpoint
CREATE INDEX "contract_signatures_user_idx" ON "contract_signatures" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "contract_signing_codes_user_created_idx" ON "contract_signing_codes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "contract_signing_codes_tenant_idx" ON "contract_signing_codes" USING btree ("tenant_id");