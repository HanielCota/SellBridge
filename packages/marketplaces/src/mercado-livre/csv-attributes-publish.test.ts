import { parseProductCsv } from "@sellbridge/shared/product-csv";
import { describe, expect, it, vi } from "vitest";
import { createMercadoLivreConnector } from "./mercado-livre-connector.ts";

/*
 * Item 18: a product imported by CSV with brand, model and barcode publishes in a category that
 * requires them; the same product imported without those columns is refused before creation.
 */
const API = "https://api.mercadolibre.com";
const store = { externalShopId: "999", accessToken: "APP_USR-token" };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const REQUIRED_BY_CATEGORY = [
  { id: "BRAND", name: "Marca", tags: { required: true } },
  { id: "MODEL", name: "Modelo", tags: { required: true } },
  { id: "GTIN", name: "Código universal de produto", tags: { required: true } },
];

const ROUTES: readonly (readonly [string, () => Response])[] = [
  [`GET ${API}/users/999/items/search`, () => json(200, { results: [], paging: { total: 0 } })],
  [`GET ${API}/users/999`, () => json(200, { tags: [] })],
  [`GET ${API}/sites/MLB/domain_discovery/search`, () => json(200, [{ category_id: "MLB1" }])],
  [`GET ${API}/categories/MLB1/attributes`, () => json(200, REQUIRED_BY_CATEGORY)],
  [`POST ${API}/items/MLB1/description`, () => json(201, {})],
  [`POST ${API}/items`, () => json(201, { id: "MLB1" })],
];

function connectorRecordingItems() {
  const createdItems: unknown[] = [];
  const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    const method = init?.method ?? "GET";
    if (method === "POST" && url === `${API}/items`) {
      createdItems.push(JSON.parse(typeof init?.body === "string" ? init.body : "null"));
    }
    const route = ROUTES.find(([key]) => {
      const [routeMethod, path] = key.split(" ");
      return routeMethod === method && path !== undefined && url.startsWith(path);
    });
    return route === undefined ? json(404, { message: `rota não mapeada ${url}` }) : route[1]();
  });
  const ml = createMercadoLivreConnector({
    clientId: "123456",
    clientSecret: "segredo",
    fetchImplementation,
    retry: { sleep: async () => {}, random: () => 0 },
    now: () => new Date("2026-01-01T00:00:00Z"),
  });
  return { ml, createdItems };
}

function importedProduct(csv: string) {
  const [row] = parseProductCsv(csv).rows;
  if (row === undefined) {
    throw new Error("linha do CSV não importada");
  }
  return {
    idempotencyKey: "l1:s1",
    title: row.product.title,
    description: row.product.description,
    priceCents: 8990,
    stock: row.product.stock,
    sku: row.product.sku,
    imageUrls: ["https://img/1.jpg"],
    mercadoLivreAttributes: row.product.mercadoLivreAttributes ?? {},
  };
}

describe("publishing a CSV-imported product on Mercado Livre", () => {
  it("passes the category's required attributes when the CSV brought them", async () => {
    const { ml, createdItems } = connectorRecordingItems();
    const product = importedProduct(
      "sku;titulo;custo;estoque;marca;modelo;gtin;peso_g\nTEN-1;Tênis de corrida leve;49,90;5;Passo Leve;PL-200;7891234567895;850",
    );

    await expect(ml.publishProduct(store, product)).resolves.toMatchObject({ externalId: "MLB1" });
    expect(createdItems[0]).toMatchObject({
      attributes: expect.arrayContaining([
        { id: "BRAND", value_name: "Passo Leve" },
        { id: "MODEL", value_name: "PL-200" },
        { id: "GTIN", value_name: "7891234567895" },
        { id: "SELLER_PACKAGE_WEIGHT", value_name: "850 g" },
      ]),
    });
  });

  it("is refused before creation when the CSV left them out", async () => {
    const { ml, createdItems } = connectorRecordingItems();
    const product = importedProduct(
      "sku;titulo;custo;estoque\nTEN-1;Tênis de corrida leve;49,90;5",
    );

    await expect(ml.publishProduct(store, product)).rejects.toMatchObject({
      message: expect.stringContaining("Marca (BRAND)"),
    });
    expect(createdItems).toEqual([]);
  });
});
