import { describe, expect, it } from "vitest";
import {
  BRAZILIAN_STATE_NAMES,
  BRAZILIAN_STATES,
  parseState,
  stateLabel,
  stateSchema,
} from "./brazilian-states.ts";

describe("brazilian states", () => {
  it("lists the 27 federative units and accepts only them", () => {
    expect(BRAZILIAN_STATES).toHaveLength(27);
    expect(stateSchema.parse("MG")).toBe("MG");
    expect(stateSchema.safeParse("mg").success).toBe(false);
    expect(stateSchema.safeParse("XX").success).toBe(false);
  });

  it("names every state", () => {
    expect(Object.keys(BRAZILIAN_STATE_NAMES).toSorted()).toEqual(BRAZILIAN_STATES.toSorted());
    expect(BRAZILIAN_STATE_NAMES.RR).toBe("Roraima");
    expect(BRAZILIAN_STATE_NAMES.SP).toBe("São Paulo");
  });

  it("keeps the list in alphabetical order of the state names", () => {
    const names = BRAZILIAN_STATES.map((state) => BRAZILIAN_STATE_NAMES[state]);

    expect(names).toEqual(names.toSorted((first, second) => first.localeCompare(second, "pt-BR")));
  });
});

describe("stateLabel", () => {
  it("joins the state name and its code", () => {
    expect(stateLabel("RR")).toBe("Roraima (RR)");
    expect(stateLabel("AM")).toBe("Amazonas (AM)");
  });
});

describe("parseState", () => {
  it("returns the state for a known code and null otherwise", () => {
    expect(parseState("AM")).toBe("AM");
    expect(parseState("")).toBeNull();
    expect(parseState("am")).toBeNull();
  });
});
