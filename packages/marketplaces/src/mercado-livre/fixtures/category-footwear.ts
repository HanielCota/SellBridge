/**
 * A simulated `GET /categories/{id}/attributes` for a footwear category, shaped like the answer
 * for Bolsas (`category-handbags.ts`): ids and value ids are made up, not read from the API.
 * Colour and "Tipo de calçado" are required, as the refusals of 26/11/2026 named them.
 */
export const FOOTWEAR_ATTRIBUTES = [
  {
    id: "BRAND",
    name: "Marca",
    tags: { catalog_required: true, required: true },
    value_type: "string",
    values: [],
  },
  {
    id: "MODEL",
    name: "Modelo",
    tags: { catalog_required: true, required: true },
    value_type: "string",
    values: [],
  },
  {
    id: "COLOR",
    name: "Cor",
    tags: { required: true },
    value_type: "list",
    values: [
      { id: "52049", name: "Preto" },
      { id: "52055", name: "Branco" },
    ],
  },
  {
    id: "FOOTWEAR_TYPE",
    name: "Tipo de calçado",
    tags: { required: true },
    value_type: "list",
    values: [
      { id: "900001", name: "Tênis" },
      { id: "900002", name: "Chinelo" },
      { id: "900003", name: "Sandália" },
      { id: "900004", name: "Babuche" },
    ],
  },
];
