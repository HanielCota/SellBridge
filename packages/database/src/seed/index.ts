import { createTokenCipher } from "@sellbridge/shared/token-cipher";
import { parseEnvironment } from "@sellbridge/shared/environment";
import { logger } from "@sellbridge/shared/logger";
import { sql } from "drizzle-orm";
import { createDatabase, type Database } from "../client.ts";
import { CUSTOMERS } from "./customers.ts";
import { ADMIN_ACCOUNT, DEMO_ACCOUNT } from "./data.ts";
import {
  ADMIN_ORGANIZATION_SLUG,
  DEMO_ORGANIZATION_SLUG,
  DEMO_SECOND_PROFILE,
  runSeed,
} from "./run.ts";
import { z } from "zod";

/** Seed passwords come from the environment so no credential lives in the code. */
const seedEnvironmentSchema = z.object({
  DATABASE_URL: z.string().min(1),
  TOKEN_ENCRYPTION_KEY: z.string().min(1, "necessária para os tokens das lojas simuladas"),
  SEED_DEMO_PASSWORD: z.string().min(8),
  SEED_ADMIN_PASSWORD: z.string().min(8),
});

const DOMAIN_TABLES = [
  "ticket_attachments",
  "ticket_messages",
  "tickets",
  "webhook_events",
  "supplier_reviews",
  "order_adjustments",
  "order_items",
  "orders",
  "listing_targets",
  "listings",
  "oauth_states",
  "store_connections",
  "supplier_products",
  "suppliers",
  "categories",
  "tenant_profile",
];

function inList(values: readonly string[]) {
  return sql`(${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )})`;
}

async function resetDomain(database: Database): Promise<void> {
  await database.execute(
    sql.raw(`truncate table ${DOMAIN_TABLES.join(", ")} restart identity cascade`),
  );
  const emails = [DEMO_ACCOUNT.email, ADMIN_ACCOUNT.email, ...CUSTOMERS.map((item) => item.email)];
  const slugs = [
    DEMO_ORGANIZATION_SLUG,
    DEMO_SECOND_PROFILE.slug,
    ADMIN_ORGANIZATION_SLUG,
    ...CUSTOMERS.map((item) => item.slug),
  ];
  await database.execute(sql`delete from "user" where email in ${inList(emails)}`);
  await database.execute(sql`delete from organization where slug in ${inList(slugs)}`);
  logger.info("seed.domain_reset");
}

async function main(): Promise<void> {
  const environment = parseEnvironment(seedEnvironmentSchema, process.env);
  const database = createDatabase(environment.DATABASE_URL, { maxConnections: 1 });
  try {
    if (process.argv.includes("--reset")) {
      await resetDomain(database);
    }
    await runSeed(database, {
      cipher: createTokenCipher(environment.TOKEN_ENCRYPTION_KEY),
      demoPassword: environment.SEED_DEMO_PASSWORD,
      adminPassword: environment.SEED_ADMIN_PASSWORD,
    });
  } finally {
    await database.$client.end();
  }
}

await main();
