CREATE TABLE "supplier_approvals" (
	"supplier_id" uuid PRIMARY KEY NOT NULL,
	"stage" text,
	"missing" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"team_reason" text,
	"cnpj" text,
	"cnpj_outcome" text,
	"receita_legal_name" text,
	"registration_status" text,
	"checked_at" timestamp with time zone,
	"unavailable_since" timestamp with time zone,
	"decided_by" text,
	"decided_by_user_id" text,
	"decided_at" timestamp with time zone,
	"refusal_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_approvals_stage_check" CHECK ("supplier_approvals"."stage" is null or "supplier_approvals"."stage" in ('waiting_supplier', 'checking', 'needs_team')),
	CONSTRAINT "supplier_approvals_team_reason_check" CHECK ("supplier_approvals"."team_reason" is null or "supplier_approvals"."team_reason" in ('cnpj_inactive', 'cnpj_not_found', 'cnpj_unsupported', 'legal_name_mismatch', 'lookup_unavailable')),
	CONSTRAINT "supplier_approvals_cnpj_outcome_check" CHECK ("supplier_approvals"."cnpj_outcome" is null or "supplier_approvals"."cnpj_outcome" in ('active', 'inactive', 'not_found', 'unsupported', 'unavailable')),
	CONSTRAINT "supplier_approvals_decided_by_check" CHECK ("supplier_approvals"."decided_by" is null or "supplier_approvals"."decided_by" in ('automatic','team')),
	CONSTRAINT "supplier_approvals_refusal_reason_check" CHECK ("supplier_approvals"."refusal_reason" is null or char_length("supplier_approvals"."refusal_reason") <= 500)
);
--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "approval_status" text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "require_receiving_account_for_approval" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_approvals" ADD CONSTRAINT "supplier_approvals_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_approvals" ADD CONSTRAINT "supplier_approvals_decided_by_user_id_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplier_approvals_needs_team_idx" ON "supplier_approvals" USING btree ("updated_at") WHERE "supplier_approvals"."stage" = 'needs_team';--> statement-breakpoint
CREATE INDEX "suppliers_pending_approval_idx" ON "suppliers" USING btree ("created_at") WHERE "suppliers"."approval_status" = 'pending';--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_approval_status_check" CHECK ("suppliers"."approval_status" in ('pending','approved','refused'));