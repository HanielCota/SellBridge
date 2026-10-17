-- The CPF change (2026-10-15) ended the region lock: supplier coverage, the CEP cache and the
-- tenant's address are no longer read anywhere. Dropping the address also stops keeping it.
DROP TABLE "cep_cache" CASCADE;--> statement-breakpoint
DROP TABLE "supplier_coverage" CASCADE;--> statement-breakpoint
ALTER TABLE "tenant_profile" DROP COLUMN "cep";--> statement-breakpoint
ALTER TABLE "tenant_profile" DROP COLUMN "state";--> statement-breakpoint
ALTER TABLE "tenant_profile" DROP COLUMN "city";--> statement-breakpoint
ALTER TABLE "tenant_profile" DROP COLUMN "neighborhood";--> statement-breakpoint
ALTER TABLE "tenant_profile" DROP COLUMN "street";--> statement-breakpoint
ALTER TABLE "tenant_profile" DROP COLUMN "number";--> statement-breakpoint
ALTER TABLE "tenant_profile" DROP COLUMN "complement";