import type { SupplierSummary } from "@sellbridge/database/repositories";

type CoveredSupplier = Pick<SupplierSummary, "id" | "name" | "productCount">;

export interface CoverageChange {
  supplierCount: number;
  productCount: number;
  /** Suppliers that start serving the tenant after the move. */
  gained: string[];
  /** Suppliers that stop serving the tenant after the move. */
  lost: string[];
  /** Products in the catalog after the move minus before it. */
  productDelta: number;
}

function totalProducts(suppliers: readonly CoveredSupplier[]): number {
  return suppliers.reduce((total, supplier) => total + supplier.productCount, 0);
}

/** What moving from one region to another does to the suppliers and products the tenant sees. */
export function compareSupplierCoverage(
  current: readonly CoveredSupplier[],
  next: readonly CoveredSupplier[],
): CoverageChange {
  const currentIds = new Set(current.map((supplier) => supplier.id));
  const nextIds = new Set(next.map((supplier) => supplier.id));
  return {
    supplierCount: next.length,
    productCount: totalProducts(next),
    gained: next
      .filter((supplier) => !currentIds.has(supplier.id))
      .map((supplier) => supplier.name),
    lost: current.filter((supplier) => !nextIds.has(supplier.id)).map((supplier) => supplier.name),
    productDelta: totalProducts(next) - totalProducts(current),
  };
}
