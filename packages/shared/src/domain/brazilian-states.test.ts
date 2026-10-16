import { describe, expect, it } from "vitest";
import { BRAZILIAN_STATES, stateSchema } from "./brazilian-states.ts";

describe("brazilian states", () => {
  it("lists the 27 federative units and accepts only them", () => {
    expect(BRAZILIAN_STATES).toHaveLength(27);
    expect(stateSchema.parse("MG")).toBe("MG");
    expect(stateSchema.safeParse("mg").success).toBe(false);
    expect(stateSchema.safeParse("XX").success).toBe(false);
  });
});
