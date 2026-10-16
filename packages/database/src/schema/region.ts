import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
    /**
     * The supplier picked during onboarding, before any shop exists: the first shop the tenant
     * connects sells it. Null until picked, or when that supplier was deleted.
     */
    starterSupplierId: uuid().references(() => suppliers.id, { onDelete: "set null" }),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    /** One account per CPF: a second account would only repeat the free plan. */
    uniqueIndex("tenant_profile_cpf_idx")
      .on(table.cpf)
      .where(sql`${table.cpf} is not null`),
    /** The foreign key: deleting a supplier clears the tenants that picked it. */
    index("tenant_profile_starter_supplier_idx").on(table.starterSupplierId),
  ],
);
