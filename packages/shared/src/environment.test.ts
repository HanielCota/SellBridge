import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseEnvironment } from "./environment.ts";

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
