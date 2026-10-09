import { createDatabase } from "@sellbridge/database/client";
import { environment } from "./environment.ts";

export const database = createDatabase(environment.DATABASE_URL);
