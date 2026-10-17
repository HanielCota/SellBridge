import { describe, expect, it } from "vitest";
import { acceptRefusal } from "./batch-accept";

describe("acceptRefusal", () => {
  const owned = [
    { id: "a", status: "forwarded" as const },
    { id: "b", status: "picking" as const },
  ];

  it("lets a forwarded parcel of the supplier through", () => {
    expect(acceptRefusal("a", owned)).toBeNull();
  });

  it("explains a parcel already past the accept, or not the supplier's", () => {
    expect(acceptRefusal("b", owned)).toBe('Já estava em "Em separação"; nada mudou.');
    expect(acceptRefusal("z", owned)).toBe(
      "Este pedido não está mais entre os seus. Atualize a lista.",
    );
  });
});
