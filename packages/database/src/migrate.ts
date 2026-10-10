import { parseEnvironment } from "@sellbridge/shared/environment";
import { logger } from "@sellbridge/shared/logger";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createDatabase } from "./client.ts";

const migrationEnvironmentSchema = z.object({ DATABASE_URL: z.string().min(1) });

const environment = parseEnvironment(migrationEnvironmentSchema, process.env);
const database = createDatabase(environment.DATABASE_URL, { maxConnections: 1 });
const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));
try {
  await migrate(database, { migrationsFolder });
  logger.info("database.migrations_applied");
} finally {
  await database.$client.end();
}
