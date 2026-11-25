import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DeveloperScopeCheckboxes } from "./developer-scope-checkboxes";

function render(value: Parameters<typeof DeveloperScopeCheckboxes>[0]["value"]): string {
  return renderToStaticMarkup(
    <DeveloperScopeCheckboxes value={value} errors={[]} onChange={() => undefined} />,
  );
}

describe("DeveloperScopeCheckboxes", () => {
  it("promises only the shipping address, which is all SellBridge stores of the buyer", () => {
    const withoutOrders = render(["stores:read"]);
    const withOrders = render(["orders:read"]);

    expect(withoutOrders).not.toContain("CPF");
    expect(withOrders).not.toContain("CPF");
    expect(withoutOrders).toContain("endereço de entrega");
  });
});
