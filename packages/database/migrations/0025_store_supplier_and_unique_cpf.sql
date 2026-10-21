ALTER TABLE "tenant_profile" ALTER COLUMN "cep" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_profile" ALTER COLUMN "state" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_profile" ALTER COLUMN "city" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "store_connections" ADD COLUMN "supplier_id" uuid;--> statement-breakpoint
ALTER TABLE "store_connections" ADD CONSTRAINT "store_connections_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- One account per CPF: before the unique index, a CPF repeated across accounts stays only on the
-- account that saved it first; the others go back to "CPF pending" and are asked for it again.
UPDATE "tenant_profile" SET "cpf" = NULL
WHERE "tenant_id" IN (
  SELECT "tenant_id" FROM (
    SELECT "tenant_id",
      row_number() OVER (PARTITION BY "cpf" ORDER BY "updated_at", "tenant_id") AS "position"
    FROM "tenant_profile"
    WHERE "cpf" IS NOT NULL
  ) AS "ranked"
  WHERE "ranked"."position" > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_profile_cpf_idx" ON "tenant_profile" USING btree ("cpf") WHERE "tenant_profile"."cpf" is not null;--> statement-breakpoint
CREATE INDEX "store_connections_supplier_idx" ON "store_connections" USING btree ("supplier_id");--> statement-breakpoint
-- A shop whose listings all come from one supplier keeps that supplier; the rest (no listings,
-- or several suppliers) stay pending until the seller picks one.
UPDATE "store_connections" SET "supplier_id" = "single"."supplier_id"
FROM (
  SELECT "listing_targets"."store_connection_id",
    (array_agg(DISTINCT "supplier_products"."supplier_id"))[1] AS "supplier_id"
  FROM "listing_targets"
  INNER JOIN "listings" ON "listings"."id" = "listing_targets"."listing_id"
  INNER JOIN "supplier_products" ON "supplier_products"."id" = "listings"."supplier_product_id"
  GROUP BY "listing_targets"."store_connection_id"
  HAVING count(DISTINCT "supplier_products"."supplier_id") = 1
) AS "single"
WHERE "store_connections"."id" = "single"."store_connection_id";
