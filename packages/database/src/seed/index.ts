import { createTokenCipher, type TokenCipher } from "@sellbridge/shared/token-cipher";
import { parseEnvironment } from "@sellbridge/shared/environment";
import { logger } from "@sellbridge/shared/logger";
import { asc, eq, sql } from "drizzle-orm";
import { createDatabase, type Database } from "../client.ts";
import { saveBillingHolder, saveCachedCep, saveStarterSupplier } from "../repositories/region.ts";
import { listings, supplierProducts } from "../schema/index.ts";
import { ensureAccount, ensureExtraProfile } from "./accounts.ts";
import { seedCatalog } from "./catalog.ts";
import { ADMIN_ACCOUNT, CACHED_CEPS, DEMO_ACCOUNT } from "./data.ts";
import { createRandom, type Random } from "./random.ts";
import { seedDemoReviews } from "./reputation.ts";
import { seedDemoSales } from "./sales.ts";
import { z } from "zod";

const DEMO_ORGANIZATION_SLUG = "ana-revendedora-demo";
const ADMIN_ORGANIZATION_SLUG = "sellbridge-admin";
/** The demo account's second seller profile, for the profile-per-tab checks. */
const DEMO_SECOND_PROFILE = { name: "Ana Acessórios", slug: "ana-acessorios-demo" } as const;

/** Seed passwords come from the environment so no credential lives in the code. */
const seedEnvironmentSchema = z.object({
  DATABASE_URL: z.string().min(1),
  TOKEN_ENCRYPTION_KEY: z.string().min(1, "necessária para os tokens das lojas simuladas"),
  SEED_DEMO_PASSWORD: z.string().min(8),
  SEED_ADMIN_PASSWORD: z.string().min(8),
});
type SeedEnvironment = z.infer<typeof seedEnvironmentSchema>;

interface SeedContext {
  readonly database: Database;
  readonly environment: SeedEnvironment;
  readonly random: Random;
  readonly cipher: TokenCipher;
}

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
  "supplier_coverage",
  "suppliers",
  "categories",
  "tenant_profile",
  "cep_cache",
];

async function resetDomain(database: Database): Promise<void> {
  await database.execute(
    sql.raw(`truncate table ${DOMAIN_TABLES.join(", ")} restart identity cascade`),
  );
  await database.execute(
    sql`delete from "user" where email in (${DEMO_ACCOUNT.email}, ${ADMIN_ACCOUNT.email})`,
  );
  await database.execute(
    sql`delete from organization where slug in (${DEMO_ORGANIZATION_SLUG}, ${DEMO_SECOND_PROFILE.slug}, ${ADMIN_ORGANIZATION_SLUG})`,
  );
  logger.info("seed.domain_reset");
}

async function seedCepCache(database: Database): Promise<void> {
  for (const entry of CACHED_CEPS) {
    await saveCachedCep(database, { ...entry }, "seed", { source: "seed" });
  }
}

async function seedAdmin(database: Database, password: string): Promise<void> {
  const admin = await ensureAccount(database, {
    ...ADMIN_ACCOUNT,
    password,
    role: "admin",
    organizationSlug: ADMIN_ORGANIZATION_SLUG,
  });
  logger.info("seed.admin_ready", { created: admin.created });
}

async function seedDemo(context: SeedContext): Promise<void> {
  const { database, random, cipher } = context;
  const demo = await ensureAccount(database, {
    name: DEMO_ACCOUNT.name,
    email: DEMO_ACCOUNT.email,
    password: context.environment.SEED_DEMO_PASSWORD,
    role: "user",
    organizationSlug: DEMO_ORGANIZATION_SLUG,
  });
  await ensureExtraProfile(database, { userId: demo.userId, ...DEMO_SECOND_PROFILE });
  await saveBillingHolder(database, demo.tenantId, DEMO_ACCOUNT.holder);
  const sales = await seedDemoSales({
    database,
    random,
    tenantId: demo.tenantId,
    cipher,
  });
  await seedDemoStarterSupplier(database, demo.tenantId);
  const reviews = await seedDemoReviews({ database, random, tenantId: demo.tenantId });
  logger.info("seed.demo_ready", {
    created: demo.created,
    orders: sales.orders,
    reviews: reviews.reviews,
  });
}

/** The demo account finished onboarding: its starter supplier is the one of its first listing. */
async function seedDemoStarterSupplier(database: Database, tenantId: string): Promise<void> {
  const [first] = await database
    .select({ supplierId: supplierProducts.supplierId })
    .from(listings)
    .innerJoin(supplierProducts, eq(supplierProducts.id, listings.supplierProductId))
    .where(eq(listings.tenantId, tenantId))
    .orderBy(asc(listings.createdAt), asc(listings.id))
    .limit(1);
  if (first === undefined) {
    throw new Error("Conta demo sem anúncios para escolher o fornecedor inicial");
  }
  await saveStarterSupplier(database, tenantId, first.supplierId);
}

async function main(): Promise<void> {
  const environment = parseEnvironment(seedEnvironmentSchema, process.env);
  const database = createDatabase(environment.DATABASE_URL, { maxConnections: 1 });
  const context: SeedContext = {
    database,
    environment,
    random: createRandom(20_261_008),
    cipher: createTokenCipher(environment.TOKEN_ENCRYPTION_KEY),
  };

  try {
    if (process.argv.includes("--reset")) {
      await resetDomain(database);
    }
    await seedCepCache(database);
    const catalog = await seedCatalog(database, context.random);
    logger.info("seed.catalog_ready", { created: catalog.created });
    await seedAdmin(database, environment.SEED_ADMIN_PASSWORD);
    await seedDemo(context);
  } finally {
    await database.$client.end();
  }
}

await main();
