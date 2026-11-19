import { sql } from "drizzle-orm";
import { PRODUCT_SOURCE_MODES } from "@sellbridge/shared/product-sources";
import { TAX_REGIMES } from "@sellbridge/shared/product-fiscal";
import type { BillingAddress } from "@sellbridge/shared/billing-address";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
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
     * The company's state registration (digits, or "ISENTO") and tax regime, for its NF-e. Null
     * for who sells as a person, and for companies saved before they were asked.
     */
    stateRegistration: text(),
    taxRegime: text({ enum: TAX_REGIMES }),
    /**
     * Where invoices and charges go (CEP digits, street, number, district, city, state); not the
     * supplier's shipping. Null for tenants saved before it was asked: the form asks for it again.
     */
    billingAddress: jsonb().$type<BillingAddress>(),
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
      "tenant_profile_tax_regime_check",
      sql`${table.taxRegime} is null or ${table.taxRegime} in ('simples', 'presumido', 'real')`,
    ),
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
