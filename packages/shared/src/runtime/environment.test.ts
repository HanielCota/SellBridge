import { describe, expect, it } from "vitest";
import { z } from "zod";
import { logLevelEnvironmentSchema, parseEnvironment } from "./environment.ts";

const schema = z.object({ DATABASE_URL: z.url(), PORT: z.coerce.number().default(3000) });

describe("parseEnvironment", () => {
  it("returns parsed values", () => {
    expect(parseEnvironment(schema, { DATABASE_URL: "postgres://localhost/db" })).toEqual({
      DATABASE_URL: "postgres://localhost/db",
      PORT: 3000,
    });
  });

  it("throws listing missing variables", () => {
    expect(() => parseEnvironment(schema, {})).toThrow(/DATABASE_URL/);
  });
});

describe("parseEnvironment renamed variables", () => {
  const renamedVariables = { OLD_DATABASE_URL: "DATABASE_URL" };

  it("fails when a renamed variable is still set", () => {
    const source = { DATABASE_URL: "postgres://localhost/db", OLD_DATABASE_URL: "x" };
    expect(() => parseEnvironment(schema, source, { renamedVariables })).toThrow(
      /OLD_DATABASE_URL: foi renomeada para DATABASE_URL/,
    );
  });

  it("accepts the environment when only the new name is set", () => {
    const source = { DATABASE_URL: "postgres://localhost/db" };
    expect(parseEnvironment(schema, source, { renamedVariables }).PORT).toBe(3000);
  });
});

describe("logLevelEnvironmentSchema", () => {
  it("normalizes case and defaults to info", () => {
    expect(logLevelEnvironmentSchema.parse("WARN")).toBe("warn");
    expect(logLevelEnvironmentSchema.parse(undefined)).toBe("info");
  });

  it("rejects unknown levels", () => {
    expect(logLevelEnvironmentSchema.safeParse("verbose").success).toBe(false);
  });
});
