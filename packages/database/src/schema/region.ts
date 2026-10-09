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
  updatedAt: timestamp({ withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
