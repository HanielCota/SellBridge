import { createDatabase, type Database } from "@sellbridge/database/client";
import { installProblemRecorder } from "@sellbridge/database/problem-recorder";
import { environment } from "./environment.ts";

declare global {
  /** Survives Vite's server hot reloads so each reload doesn't open a new connection pool. */
  var sellbridgeDatabase: Database | undefined;
  /** Stops the previous problem recorder, so a hot reload does not record each problem twice. */
  var sellbridgeStopProblemRecorder: (() => void) | undefined;
}

function sharedDatabase(): Database {
  const existing = globalThis.sellbridgeDatabase;
  if (existing) {
    return existing;
  }
  const created = createDatabase(environment.DATABASE_URL);
  if (environment.NODE_ENV !== "production") {
    globalThis.sellbridgeDatabase = created;
  }
  return created;
}

export const database = sharedDatabase();

globalThis.sellbridgeStopProblemRecorder?.();
globalThis.sellbridgeStopProblemRecorder = installProblemRecorder(database, {
  service: "web",
}).stop;
