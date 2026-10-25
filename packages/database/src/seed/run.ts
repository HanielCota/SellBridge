import { TERMS_VERSION } from "@sellbridge/shared/terms";
import type { TokenCipher } from "@sellbridge/shared/token-cipher";
import { logger } from "@sellbridge/shared/logger";
import type { Database } from "../client.ts";
import { saveBillingHolder } from "../repositories/region.ts";
import { recordTermsAcceptance } from "../repositories/terms-acceptances.ts";
import { ensureAccount, ensureExtraProfile, type SeededAccount } from "./accounts.ts";
import { seedCatalog } from "./catalog.ts";
import { seedAdminWorkspace, seedCustomers, seedStarterSupplierFromListings } from "./customers.ts";
import { ADMIN_ACCOUNT, DEMO_ACCOUNT } from "./data.ts";
import { createRandom, type Random } from "./random.ts";
import { seedDemoReviews } from "./reputation.ts";
import { seedDemoSales } from "./sales.ts";
import { seedSupportTickets } from "./support.ts";
import { seedSupportPerformance } from "./support-performance.ts";

export const DEMO_ORGANIZATION_SLUG = "ana-revendedora-demo";
export const ADMIN_ORGANIZATION_SLUG = "sellbridge-admin";
/** The demo account's second seller profile, for the profile-per-tab checks. */
export const DEMO_SECOND_PROFILE = { name: "Ana Acessórios", slug: "ana-acessorios-demo" } as const;

export interface RunSeedOptions {
  readonly cipher: TokenCipher;
  readonly demoPassword: string;
  readonly adminPassword: string;
}

interface SeedContext extends RunSeedOptions {
  readonly database: Database;
  readonly random: Random;
}

async function seedAdmin(database: Database, password: string): Promise<SeededAccount> {
  const admin = await ensureAccount(database, {
    ...ADMIN_ACCOUNT,
    password,
    role: "admin",
    organizationSlug: ADMIN_ORGANIZATION_SLUG,
  });
  // Seeded accounts start with the terms accepted, as a sign-up through /cadastro does (26.a).
  await recordTermsAcceptance(database, admin.userId, TERMS_VERSION);
  logger.info("seed.admin_ready", { created: admin.created });
  return admin;
}

async function seedDemo(context: SeedContext): Promise<SeededAccount> {
  const { database, random, cipher } = context;
  const demo = await ensureAccount(database, {
    name: DEMO_ACCOUNT.name,
    email: DEMO_ACCOUNT.email,
    password: context.demoPassword,
    role: "user",
    organizationSlug: DEMO_ORGANIZATION_SLUG,
  });
  await saveBillingHolder(database, demo.tenantId, DEMO_ACCOUNT.holder);
  await ensureExtraProfile(database, { userId: demo.userId, ...DEMO_SECOND_PROFILE });
  await recordTermsAcceptance(database, demo.userId, TERMS_VERSION);
  const sales = await seedDemoSales({
    database,
    random,
    tenantId: demo.tenantId,
    cipher,
  });
  await seedStarterSupplierFromListings(database, demo.tenantId);
  const reviews = await seedDemoReviews({ database, random, tenantId: demo.tenantId });
  logger.info("seed.demo_ready", {
    created: demo.created,
    orders: sales.orders,
    reviews: reviews.reviews,
  });
  return demo;
}

/** Everything the local environment and the E2E tests expect; idempotent. */
export async function runSeed(database: Database, options: RunSeedOptions): Promise<void> {
  const context: SeedContext = { ...options, database, random: createRandom(20_261_008) };
  const catalog = await seedCatalog(database, context.random);
  logger.info("seed.catalog_ready", { created: catalog.created });
  const admin = await seedAdmin(database, options.adminPassword);
  // The demo account first: it draws from the seeded random sequence exactly as before.
  const demo = await seedDemo(context);
  await seedAdminWorkspace(context, admin);
  const customers = await seedCustomers(context, options.demoPassword);
  const authors = new Map([[DEMO_ACCOUNT.email, demo], ...customers]);
  const ticketsCreated = await seedSupportTickets(database, authors, admin);
  logger.info("seed.support_ready", { tickets: ticketsCreated });
  const history = await seedSupportPerformance(database, {
    authors: [...authors.values()],
    // Team accounts can enter customer accounts: they share the admin password, not the demo one.
    password: options.adminPassword,
  });
  logger.info("seed.support_history_ready", { tickets: history });
}
