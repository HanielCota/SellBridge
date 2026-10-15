ALTER TABLE "tenant_profile" ADD COLUMN "starter_supplier_id" uuid;--> statement-breakpoint
ALTER TABLE "tenant_profile" ADD CONSTRAINT "tenant_profile_starter_supplier_id_suppliers_id_fk" FOREIGN KEY ("starter_supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tenant_profile_starter_supplier_idx" ON "tenant_profile" USING btree ("starter_supplier_id");--> statement-breakpoint
-- Tenants who already sell keep the supplier of their oldest linked shop as the starter one.
UPDATE "tenant_profile" SET "starter_supplier_id" = "oldest"."supplier_id"
FROM (
  SELECT DISTINCT ON ("tenant_id") "tenant_id", "supplier_id"
  FROM "store_connections"
  WHERE "supplier_id" IS NOT NULL AND "status" <> 'disconnected'
  ORDER BY "tenant_id", "connected_at", "id"
) AS "oldest"
WHERE "tenant_profile"."tenant_id" = "oldest"."tenant_id";
