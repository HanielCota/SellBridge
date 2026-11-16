import { createMercadoLivreCatalog } from "../mercado-livre/category-ficha.ts";
import { HANDBAG_ATTRIBUTES } from "../mercado-livre/fixtures/category-handbags.ts";

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/**
 * The category reader answering from a recorded handbag category instead of Mercado Livre, so
 * the end-to-end tests never call the real API. Every title suggests "Bolsas" first.
 */
export function createTestMercadoLivreCatalog() {
  return createMercadoLivreCatalog({
    fetchImplementation: async (url) => {
      if (url.includes("/domain_discovery/search")) {
        return json([
          { category_id: "MLB7022", category_name: "Bolsas" },
          { category_id: "MLB1430", category_name: "Mochilas" },
        ]);
      }
      return json(HANDBAG_ATTRIBUTES);
    },
  });
}
