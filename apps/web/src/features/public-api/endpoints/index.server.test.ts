import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildOpenApiDocument } from "../openapi";

// Endpoints import the database and environment, which read env vars at import time; the
// document is built from the definitions only, so neither is ever used here.
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/environment", () => ({
  environment: {
    APP_URL: "https://app.test",
    NODE_ENV: "test",
    TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
  },
}));

const { API_OPERATIONS } = await import("./index.server");

const ROUTES_DIRECTORY = join(import.meta.dirname, "../../../routes/api/v1");

function routeFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? routeFiles(path) : [path];
  });
}

/** `/listings/{listingId}` → `/api/v1/listings/$listingId`, as in createFileRoute. */
function routePathOf(path: string): string {
  return `/api/v1${path.replaceAll(/\{(\w+)\}/g, "$$$1")}`;
}

describe("public API operations", () => {
  it("builds the OpenAPI document from every operation", () => {
    const document = buildOpenApiDocument({
      operations: API_OPERATIONS,
      serverUrl: "https://app.test/api/v1",
      description: "Teste",
    });
    const documented = Object.values(document.paths).flatMap((methods) => Object.keys(methods));
    expect(documented).toHaveLength(API_OPERATIONS.length);
  });

  it("gives every operation a unique id", () => {
    const ids = API_OPERATIONS.map((operation) => operation.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has a route handler for every documented operation", () => {
    const sources = routeFiles(ROUTES_DIRECTORY).map((file) => readFileSync(file, "utf8"));
    for (const operation of API_OPERATIONS) {
      const routePath = routePathOf(operation.path);
      // Index routes (a folder's index.ts) are declared with a trailing slash.
      const route = sources.find(
        (source) =>
          source.includes(`createFileRoute("${routePath}")`) ||
          source.includes(`createFileRoute("${routePath}/")`),
      );
      expect(route, `${operation.method} ${operation.path}`).toBeDefined();
      expect(route, `${operation.method} ${operation.path}`).toContain(`${operation.method}:`);
    }
  });
});
