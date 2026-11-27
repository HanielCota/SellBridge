import { parseEnvironment } from "@sellbridge/shared/environment";
import { logger } from "@sellbridge/shared/logger";
import { z } from "zod";
import { applyMigrations } from "./apply-migrations.ts";

const migrationEnvironmentSchema = z.object({ DATABASE_URL: z.string().min(1) });

const environment = parseEnvironment(migrationEnvironmentSchema, process.env);
await applyMigrations(environment.DATABASE_URL);
logger.info("database.migrations_applied");
