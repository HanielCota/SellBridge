import { createDatabase } from "@sellbridge/db/client";
import { env } from "./env.ts";

export const db = createDatabase(env.DATABASE_URL);
