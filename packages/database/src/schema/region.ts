import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization } from "./auth.ts";

export const cepCache = pgTable("cep_cache", {
  cep: text().primaryKey(),
  state: text().notNull(),
  city: text().notNull(),
  neighborhood: text(),
  street: text(),
  provider: text().notNull(),
  payload: jsonb().notNull(),
  fetchedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

export const tenantProfile = pgTable("tenant_profile", {
  tenantId: text()
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  cep: text().notNull(),
  state: text().notNull(),
  city: text().notNull(),
  neighborhood: text(),
  // Street address typed or confirmed by the tenant; city and state above always come from the CEP.
  street: text(),
  number: text(),
  complement: text(),
  // Who invoices and charges go to. Null for tenants saved before the field existed.
  fullName: text(),
  // Digits only.
  cpf: text(),
  updatedAt: timestamp({ withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
