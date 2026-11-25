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

  it("shows entry links in their own block about what the key creates", () => {
    const markup = render(["stores:read"]);

    const createBlock = markup.slice(markup.indexOf("O que a chave pode criar"));
    expect(markup.indexOf("O que a chave pode criar")).toBeGreaterThan(-1);
    expect(createBlock).toContain("links:create");
    expect(markup.slice(0, markup.indexOf("O que a chave pode criar"))).not.toContain(
      "links:create",
    );
  });
});
