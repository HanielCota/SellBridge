import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StateField, stateFieldLabel } from "./state-field";

const MINAS_GERAIS_TRIANGLE = 'd="M10 3 14.2 10.4H5.8Z"';
const FLAG_VIEW_BOX = 'viewBox="0 0 20 20"';

function renderTrigger(value: string): string {
  return renderToStaticMarkup(
    <StateField id="state" label="UF de origem" value={value} onChange={() => undefined} />,
  );
}

describe("stateFieldLabel", () => {
  it("names a state by its full name and code", () => {
    expect(stateFieldLabel("SP")).toBe("São Paulo (SP)");
    expect(stateFieldLabel("MG")).toBe("Minas Gerais (MG)");
  });

  it("keeps a code it doesn't know as it came", () => {
    expect(stateFieldLabel("ZZ")).toBe("ZZ");
    expect(stateFieldLabel("")).toBe("");
  });
});

describe("StateField", () => {
  it("shows the chosen state's flag, name and code on the trigger", () => {
    const markup = renderTrigger("MG");
    expect(markup).toContain(MINAS_GERAIS_TRIANGLE);
    expect(markup).toContain("Minas Gerais (MG)");
  });

  it("shows no flag while no known state is chosen", () => {
    expect(renderTrigger("")).not.toContain(FLAG_VIEW_BOX);
  });
});
