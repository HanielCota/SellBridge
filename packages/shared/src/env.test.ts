import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseEnv } from "./env.ts";

const schema = z.object({ DATABASE_URL: z.url(), PORT: z.coerce.number().default(3000) });

describe("parseEnv", () => {
  it("returns parsed values", () => {
    expect(parseEnv(schema, { DATABASE_URL: "postgres://localhost/db" })).toEqual({
      DATABASE_URL: "postgres://localhost/db",
      PORT: 3000,
    });
  });

  it("throws listing missing variables", () => {
    expect(() => parseEnv(schema, {})).toThrow(/DATABASE_URL/);
  });
});
