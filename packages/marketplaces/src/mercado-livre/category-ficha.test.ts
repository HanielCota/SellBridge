import { describe, expect, it, vi } from "vitest";
import { createMercadoLivreCatalog, fichaAttributeSchema, fichaFields } from "./category-ficha.ts";
import { HANDBAG_ATTRIBUTES } from "./fixtures/category-handbags.ts";

const attributes = HANDBAG_ATTRIBUTES.map((attribute) => fichaAttributeSchema.parse(attribute));

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("fichaFields", () => {
  it("offers the fields a seller fills, required first", () => {
    const fields = fichaFields(attributes);

    expect(fields.map((field) => [field.id, field.required])).toEqual([
      ["BRAND", true],
      ["MODEL", true],
      ["GENDER", false],
      ["IS_VEGAN", false],
    ]);
  });

  it("leaves out hidden, read-only, barcode and package attributes", () => {
    const ids = fichaFields(attributes).map((field) => field.id);

    expect(ids).not.toContain("AGE_GROUP");
    expect(ids).not.toContain("PACKAGE_HEIGHT");
    expect(ids).not.toContain("GTIN");
    expect(ids).not.toContain("SELLER_PACKAGE_WEIGHT");
  });

  it("turns a list into a choice and a boolean into yes or no", () => {
    const fields = fichaFields(attributes);

    expect(fields.find((field) => field.id === "GENDER")).toMatchObject({
      kind: "choice",
      options: ["Feminino", "Meninas"],
    });
    expect(fields.find((field) => field.id === "IS_VEGAN")).toMatchObject({
      kind: "yes_no",
      options: ["Sim", "Não"],
    });
  });

  it("keeps Mercado Livre's hint, example and length limit", () => {
    const fields = fichaFields(attributes);

    expect(fields.find((field) => field.id === "BRAND")).toMatchObject({
      kind: "text",
      maxLength: 255,
      hint: "Informe a marca verdadeira do produto ou 'Generic' se não tiver marca.",
    });
    expect(fields.find((field) => field.id === "MODEL")?.example).toBe("Nina");
  });

  it("reads a number with unit as a measure with its units", () => {
    const [measure] = fichaFields([
      fichaAttributeSchema.parse({
        id: "HEIGHT",
        name: "Altura",
        value_type: "number_unit",
        allowed_units: [
          { id: "cm", name: "cm" },
          { id: "mm", name: "mm" },
        ],
        default_unit: "cm",
      }),
    ]);

    expect(measure).toMatchObject({ kind: "measure", units: ["cm", "mm"], defaultUnit: "cm" });
  });
});

describe("createMercadoLivreCatalog", () => {
  it("suggests categories and reads their fields without a seller token", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.includes("/domain_discovery/search")) {
        return json([{ category_id: "MLB7022", category_name: "Bolsas" }]);
      }
      return json(HANDBAG_ATTRIBUTES);
    });
    const catalog = createMercadoLivreCatalog({ fetchImplementation });

    const categories = await catalog.suggestCategories("Bolsinha infantil preta");
    const fields = await catalog.categoryFields("MLB7022");

    expect(categories).toEqual([{ id: "MLB7022", name: "Bolsas" }]);
    expect(fields[0]?.id).toBe("BRAND");
    const headers = fetchImplementation.mock.calls.map(([, init]) => new Headers(init?.headers));
    expect(headers.every((header) => header.get("authorization") === null)).toBe(true);
    const [firstUrl] = fetchImplementation.mock.calls[0] ?? [];
    expect(typeof firstUrl === "string" ? firstUrl : "").toContain("limit=3");
  });
});
