import type { TokenCipher } from "@sellbridge/shared/token-cipher";
import { logger } from "@sellbridge/shared/logger";
import { asc, eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import {
  type BillingHolder,
  saveBillingHolder,
  saveStarterSupplier,
} from "../repositories/region.ts";
import { listings, supplierProducts } from "../schema/index.ts";
import { ensureAccount, type SeededAccount } from "./accounts.ts";
import type { SeedStore } from "./data.ts";
import type { Random } from "./random.ts";
import { seedDemoSales } from "./sales.ts";

/** The admin account's own shop, so the admin screens open on real data, not empty states. */
export const ADMIN_STORES: readonly SeedStore[] = [
  {
    externalShopId: "mock-shop-admin-vitrine",
    shopName: "Vitrine SellBridge (loja simulada)",
    supplierName: "Curitiba Tech Acessórios",
  },
];

interface SeedCustomer {
  readonly name: string;
  readonly email: string;
  readonly slug: string;
  /** Null: the customer stopped at onboarding, before the billing holder. */
  readonly holder: BillingHolder | null;
  readonly stores: readonly SeedStore[];
}

/**
 * One customer per situation the admin's Clientes screen handles: selling, a shop to
 * reconnect, and an account still in onboarding. Well-known test CPFs (valid check digits).
 */
export const CUSTOMERS: readonly SeedCustomer[] = [
  {
    name: "Bruno Calçados",
    email: "bruno@sellbridge.local",
    slug: "bruno-revendedor-demo",
    holder: { fullName: "Bruno Martins Lopes", cpf: "11144477735" },
    stores: [
      {
        externalShopId: "mock-shop-bruno-pe",
        shopName: "Bruno Pé no Chão (loja simulada)",
        supplierName: "Franca Calçados Direto da Fábrica",
      },
    ],
  },
  {
    name: "Carla Pet",
    email: "carla@sellbridge.local",
    slug: "carla-revendedora-demo",
    holder: { fullName: "Carla Nunes Pereira", cpf: "39053344705" },
    stores: [
      {
        externalShopId: "mock-shop-carla-pet",
        shopName: "Carla Pet (loja simulada)",
        supplierName: "Rio Pet Atacado",
        status: "expired",
      },
    ],
  },
  {
    name: "Daniel Souza",
    email: "daniel@sellbridge.local",
    slug: "daniel-revendedor-demo",
    holder: null,
    stores: [],
  },
];

export interface SeedAccountsContext {
  readonly database: Database;
  readonly random: Random;
  readonly cipher: TokenCipher;
}

/** The supplier of the tenant's first listing becomes its starter supplier (onboarding done). */
export async function seedStarterSupplierFromListings(
  database: Database,
  tenantId: string,
): Promise<void> {
  const [first] = await database
    .select({ supplierId: supplierProducts.supplierId })
    .from(listings)
    .innerJoin(supplierProducts, eq(supplierProducts.id, listings.supplierProductId))
    .where(eq(listings.tenantId, tenantId))
    .orderBy(asc(listings.createdAt), asc(listings.id))
    .limit(1);
  if (first === undefined) {
    throw new Error("Conta de seed sem anúncios para escolher o fornecedor inicial");
  }
  await saveStarterSupplier(database, tenantId, first.supplierId);
}

/** Shops, listings and sales history for a seeded tenant that has shops. */
async function seedShopHistory(
  context: SeedAccountsContext,
  tenantId: string,
  stores: readonly SeedStore[],
): Promise<number> {
  if (stores.length === 0) {
    return 0;
  }
  const sales = await seedDemoSales({ ...context, tenantId, stores });
  await seedStarterSupplierFromListings(context.database, tenantId);
  return sales.orders;
}

/** The admin's workspace: one connected shop with listings and orders. */
export async function seedAdminWorkspace(
  context: SeedAccountsContext,
  admin: SeededAccount,
): Promise<void> {
  const orders = await seedShopHistory(context, admin.tenantId, ADMIN_STORES);
  logger.info("seed.admin_workspace_ready", { orders });
}

/** The example customers, all with the demo password; returns them by e-mail. */
export async function seedCustomers(
  context: SeedAccountsContext,
  password: string,
): Promise<Map<string, SeededAccount>> {
  const accounts = new Map<string, SeededAccount>();
  for (const customer of CUSTOMERS) {
    const account = await ensureAccount(context.database, {
      name: customer.name,
      email: customer.email,
      password,
      role: "user",
      organizationSlug: customer.slug,
    });
    if (customer.holder !== null) {
      await saveBillingHolder(context.database, account.tenantId, customer.holder);
    }
    await seedShopHistory(context, account.tenantId, customer.stores);
    accounts.set(customer.email, account);
  }
  logger.info("seed.customers_ready", { customers: accounts.size });
  return accounts;
}
