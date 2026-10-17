import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supplierProducts, suppliers } from "../schema/index.ts";
import { createTestDatabase } from "../testing/fixtures.ts";
import { listAdminSupplierOptions } from "./admin-supplier-options.ts";
import {
  listActiveNiches,
  listActiveSuppliers,
  listSupplierDirectory,
  listSupplierLocations,
} from "./suppliers.ts";

/**
 * Suppliers now sign up on their own and start with an empty catalog: resellers only find the
 * ones with at least one approved, active product. Staff still sees every active supplier.
 */
const database = createTestDatabase();
const marker = `Vitrine ${randomUUID().slice(0, 8)}`;
const supplierKinds = ["approved", "draftOnly", "inactiveOnly", "empty"] as const;
type SupplierKind = (typeof supplierKinds)[number];
const ids: Record<SupplierKind, string> = {
  approved: "",
  draftOnly: "",
  inactiveOnly: "",
  empty: "",
};

async function insertSupplier(kind: SupplierKind): Promise<string> {
  const [row] = await database
    .insert(suppliers)
    .values({
      name: `${marker} ${kind}`,
      niche: `${marker} nicho ${kind}`,
      state: "SP",
      city: `${marker} cidade ${kind}`,
    })
    .returning({ id: suppliers.id });
  return row?.id ?? "";
}

async function insertProduct(
  supplierId: string,
  values: { reviewStatus: "approved" | "draft" | "in_review"; active: boolean },
) {
  await database.insert(supplierProducts).values({
    supplierId,
    sku: `VIT-${randomUUID().slice(0, 8)}`,
    title: `${marker} produto`,
    costCents: 1000,
    suggestedPriceCents: 1990,
    stock: 10,
    ...values,
  });
}

beforeAll(async () => {
  for (const kind of supplierKinds) {
    ids[kind] = await insertSupplier(kind);
  }
  await insertProduct(ids.approved, { reviewStatus: "approved", active: true });
  await insertProduct(ids.approved, { reviewStatus: "draft", active: true });
  await insertProduct(ids.draftOnly, { reviewStatus: "draft", active: true });
  await insertProduct(ids.draftOnly, { reviewStatus: "in_review", active: true });
  await insertProduct(ids.inactiveOnly, { reviewStatus: "approved", active: false });
});

afterAll(async () => {
  await database.delete(suppliers).where(inArray(suppliers.id, Object.values(ids)));
});

const ownIds = (rows: { id: string }[]) =>
  rows.map((row) => row.id).filter((id) => Object.values(ids).includes(id));

describe("supplier visibility for resellers", () => {
  it("hides suppliers without approved products from resellers", async () => {
    const pickable = await listActiveSuppliers(database, { search: marker });
    expect(ownIds(pickable)).toEqual([ids.approved]);
    expect(pickable[0]?.productCount).toBe(1);
    const directory = await listSupplierDirectory(database, { search: marker });
    expect(ownIds(directory)).toEqual([ids.approved]);
  });

  it("offers only the niches and cities of suppliers resellers can find", async () => {
    const niches = await listActiveNiches(database);
    expect(niches.filter((niche) => niche.startsWith(marker))).toEqual([
      `${marker} nicho approved`,
    ]);
    const locations = await listSupplierLocations(database);
    const cities = locations.flatMap((location) => location.cities);
    expect(cities.filter((city) => city.startsWith(marker))).toEqual([`${marker} cidade approved`]);
  });

  it("keeps every active supplier on the staff screens", async () => {
    const options = await listAdminSupplierOptions(database);
    expect(ownIds(options).toSorted()).toEqual(Object.values(ids).toSorted());
  });
});
