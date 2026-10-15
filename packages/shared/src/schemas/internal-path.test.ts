import { describe, expect, it } from "vitest";
import { internalPathSchema } from "./internal-path.ts";

describe("internalPathSchema", () => {
  it("keeps a path on this site, with its search and hash", () => {
    expect(internalPathSchema.parse("/pedidos?status=pago#topo")).toBe("/pedidos?status=pago#topo");
    expect(internalPathSchema.parse(undefined)).toBeUndefined();
  });

  it.each([
    "//evil.example",
    "//evil.example/dashboard",
    "/\\evil.example",
    "/\\/evil.example",
    "\\/evil.example",
    "/dashboard\\..\\",
    "https://evil.example",
    "javascript:alert(1)",
    "dashboard",
    "/\t/evil.example",
    "/\n/evil.example",
    " /dashboard",
    "",
  ])("drops %j instead of failing the page", (value) => {
    expect(internalPathSchema.parse(value)).toBeUndefined();
  });

  it("drops a value that is not text at all", () => {
    expect(internalPathSchema.parse(["/dashboard"])).toBeUndefined();
  });
});
