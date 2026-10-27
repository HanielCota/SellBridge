import { BRAZILIAN_STATE_NAMES } from "@sellbridge/shared/brazilian-states";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ALL_STATES,
  STATE_OPTIONS,
  SupplierStateSelect,
  stateLabel,
} from "./supplier-state-select";

const BRAZIL_FLAG_GREEN = 'fill="#009C3B"';
const MINAS_GERAIS_TRIANGLE = 'd="M10 3 14.2 10.4H5.8Z"';
const MAP_PIN_VIEW_BOX = 'viewBox="0 0 256 256"';

function renderTrigger(value: string): string {
  return renderToStaticMarkup(<SupplierStateSelect value={value} onChange={() => undefined} />);
}

describe("STATE_OPTIONS", () => {
  it("offers all 27 Brazilian states in alphabetical order of their names", () => {
    const names = STATE_OPTIONS.map((state) => BRAZILIAN_STATE_NAMES[state]);
    expect(STATE_OPTIONS).toHaveLength(27);
    expect(names).toEqual(names.toSorted((first, second) => first.localeCompare(second, "pt-BR")));
    expect(STATE_OPTIONS.slice(0, 4)).toEqual(["AC", "AL", "AP", "AM"]);
    expect(STATE_OPTIONS.at(-1)).toBe("TO");
  });
});

describe("stateLabel", () => {
  it("names a state by its full name", () => {
    expect(stateLabel("RR")).toBe("Roraima");
    expect(stateLabel("SP")).toBe("São Paulo");
  });

  it("reads the cleared filter as the whole country", () => {
    expect(stateLabel(ALL_STATES)).toBe("Todo o Brasil");
  });

  it("keeps a code it doesn't know as it came", () => {
    expect(stateLabel("ZZ")).toBe("ZZ");
  });
});

describe("SupplierStateSelect", () => {
  it("shows the Brazilian flag and the all-states label when no state is chosen", () => {
    const markup = renderTrigger(ALL_STATES);

    expect(markup).toContain("Todo o Brasil");
    expect(markup).toContain(BRAZIL_FLAG_GREEN);
    expect(markup).toContain('aria-label="Estado do fornecedor"');
  });

  it("shows the chosen state's name next to its flag", () => {
    const markup = renderTrigger("MG");

    expect(markup).toContain(">Minas Gerais</span>");
    expect(markup).toContain(MINAS_GERAIS_TRIANGLE);
    expect(markup).not.toContain(BRAZIL_FLAG_GREEN);
  });

  it("falls back to a pin and the raw code for a code that is not a Brazilian state", () => {
    const markup = renderTrigger("XX");

    expect(markup).toContain(">XX</span>");
    expect(markup).not.toContain("<clipPath");
    expect(markup.split(MAP_PIN_VIEW_BOX)).toHaveLength(3);
  });
});
