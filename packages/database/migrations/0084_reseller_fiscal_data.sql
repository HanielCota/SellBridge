ALTER TABLE "tenant_profile" ADD COLUMN "state_registration" text;--> statement-breakpoint
ALTER TABLE "tenant_profile" ADD COLUMN "tax_regime" text;--> statement-breakpoint
ALTER TABLE "tenant_profile" ADD CONSTRAINT "tenant_profile_tax_regime_check" CHECK ("tenant_profile"."tax_regime" is null or "tenant_profile"."tax_regime" in ('simples', 'presumido', 'real'));