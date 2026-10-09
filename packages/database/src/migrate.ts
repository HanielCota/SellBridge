import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import { createDatabase } from "./client.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL não definida");
}

const database = createDatabase(databaseUrl, { maxConnections: 1 });
const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));
await migrate(database, { migrationsFolder });
await database.$client.end();
console.log("Migrations aplicadas");
