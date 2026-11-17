ALTER TABLE "store_connections" DROP CONSTRAINT "store_connections_supplier_id_suppliers_id_fk";
--> statement-breakpoint
DROP INDEX "store_connections_supplier_idx";--> statement-breakpoint
ALTER TABLE "store_connections" DROP COLUMN "supplier_id";