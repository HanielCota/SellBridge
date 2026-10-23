import { sql } from "drizzle-orm";
import { PRODUCT_SOURCE_MODES } from "@sellbridge/shared/product-sources";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organization } from "./auth.ts";
import { suppliers } from "./suppliers.ts";

export const tenantProfile = pgTable(
  "tenant_profile",
  {
    tenantId: text()
      .primaryKey()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Who invoices and charges go to. Null for tenants saved before the field existed.
    fullName: text(),
    // Digits only.
    cpf: text(),
    /** Digits only, with area code (item 26.a). Null for tenants saved before the field existed. */
    phone: text(),
    /** Digits only; set with `companyName` for who sells as a company, else both null. */
    cnpj: text(),
    companyName: text(),
    /**
     * The supplier picked during onboarding, before any shop exists: the first shop the tenant
     * connects sells it. Null for own-only sellers, until picked, or after supplier deletion.
     */
    starterSupplierId: uuid().references(() => suppliers.id, { onDelete: "set null" }),
    /** Null until the seller explicitly chooses which products to sell. */
    productSourceMode: text({ enum: PRODUCT_SOURCE_MODES }),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "tenant_profile_product_source_mode_check",
      sql`${table.productSourceMode} is null or ${table.productSourceMode} in ('own', 'suppliers', 'both')`,
    ),
    /** One account per CPF: a second account would only repeat the free plan. */
    uniqueIndex("tenant_profile_cpf_idx")
      .on(table.cpf)
      .where(sql`${table.cpf} is not null`),
    /** The foreign key: deleting a supplier clears the tenants that picked it. */
    index("tenant_profile_starter_supplier_idx").on(table.starterSupplierId),
  ],
);
