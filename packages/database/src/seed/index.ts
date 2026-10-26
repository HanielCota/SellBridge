import { createDatabase } from "../client.ts";
import { parseEnvironment } from "@sellbridge/shared/environment";
import { logger } from "@sellbridge/shared/logger";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { categories, user } from "../schema/index.ts";
import { CATEGORIES } from "./categories.ts";
import { ensureAccount } from "./accounts.ts";

const bootstrapSchema = z.object({
  DATABASE_URL: z.url(),
  BOOTSTRAP_ADMIN_EMAIL: z.email(),
  BOOTSTRAP_ADMIN_NAME: z.string().trim().min(1),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(12),
});

async function main(): Promise<void> {
  if (process.argv.includes("--reset")) {
    throw new Error("The bootstrap command does not delete application data.");
  }
  const environment = parseEnvironment(bootstrapSchema, process.env);
  const database = createDatabase(environment.DATABASE_URL, { maxConnections: 1 });
  try {
    await database
      .insert(categories)
      .values(CATEGORIES)
      .onConflictDoNothing({ target: categories.slug });
    const existing = await database.query.user.findFirst({
      where: eq(user.email, environment.BOOTSTRAP_ADMIN_EMAIL.toLowerCase()),
    });
    if (existing !== undefined && existing.role !== "admin") {
      throw new Error("Bootstrap cannot change the role of an existing account.");
    }
    const result = await ensureAccount(database, {
      name: environment.BOOTSTRAP_ADMIN_NAME,
      email: environment.BOOTSTRAP_ADMIN_EMAIL.toLowerCase(),
      password: environment.BOOTSTRAP_ADMIN_PASSWORD,
      role: "admin",
      organizationSlug: "platform-admin",
    });
    logger.info("bootstrap.admin_ready", { created: result.created });
  } finally {
    await database.$client.end();
  }
}

await main();
