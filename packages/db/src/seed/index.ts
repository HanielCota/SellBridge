import { createTokenCipher } from "@sellbridge/marketplaces";
import { sql } from "drizzle-orm";
import { createDatabase, type Database } from "../client.ts";
import { saveCachedCep, saveTenantRegion } from "../repositories/region.ts";
import { ensureAccount } from "./accounts.ts";
import { seedCatalog } from "./catalog.ts";
import { ADMIN_ACCOUNT, CACHED_CEPS, DEMO_ACCOUNT } from "./data.ts";
import { createRandom } from "./random.ts";

const DEMO_ORGANIZATION_SLUG = "ana-revendedora-demo";
const ADMIN_ORGANIZATION_SLUG = "sellbridge-admin";
import { seedDemoSales } from "./sales.ts";

const DOMAIN_TABLES = [
  "ticket_attachments",
  "ticket_messages",
  "tickets",
  "webhook_events",
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

async function resetDomain(db: Database): Promise<void> {
  await db.execute(sql.raw(`truncate table ${DOMAIN_TABLES.join(", ")} restart identity cascade`));
  await db.execute(
    sql`delete from "user" where email in (${DEMO_ACCOUNT.email}, ${ADMIN_ACCOUNT.email})`,
  );
  await db.execute(
    sql`delete from organization where slug in (${DEMO_ORGANIZATION_SLUG}, ${ADMIN_ORGANIZATION_SLUG})`,
  );
  console.log("Dados de domínio e contas de seed removidos");
}

async function seedCepCache(db: Database): Promise<void> {
  for (const entry of CACHED_CEPS) {
    await saveCachedCep(db, { ...entry }, "seed", { source: "seed" });
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL não definida");
  }
  const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY não definida (necessária para os tokens das lojas simuladas)",
    );
  }
  const cipher = createTokenCipher(encryptionKey);
  const db = createDatabase(databaseUrl, { maxConnections: 1 });
  const random = createRandom(20_261_008);

  if (process.argv.includes("--reset")) {
    await resetDomain(db);
  }

  await seedCepCache(db);
  const catalog = await seedCatalog(db, random);
  console.log(catalog.created ? "Catálogo criado" : "Catálogo já existia");

  const admin = await ensureAccount(db, {
    ...ADMIN_ACCOUNT,
    role: "admin",
    organizationSlug: ADMIN_ORGANIZATION_SLUG,
  });
  console.log(`Admin: ${ADMIN_ACCOUNT.email} ${admin.created ? "(criado)" : "(existente)"}`);

  const demo = await ensureAccount(db, {
    name: DEMO_ACCOUNT.name,
    email: DEMO_ACCOUNT.email,
    password: DEMO_ACCOUNT.password,
    role: "user",
    organizationSlug: DEMO_ORGANIZATION_SLUG,
  });
  const demoCep = CACHED_CEPS.find((entry) => entry.cep === DEMO_ACCOUNT.cep);
  if (!demoCep) {
    throw new Error("CEP da conta demo não está no cache de seed");
  }
  await saveTenantRegion(db, demo.tenantId, { ...demoCep });
  const sales = await seedDemoSales(db, random, demo.tenantId, demoCep, cipher);
  console.log(
    `Demo: ${DEMO_ACCOUNT.email} ${demo.created ? "(criada)" : "(existente)"}, ${sales.orders} pedidos`,
  );

  await db.$client.end();
}

await main();
