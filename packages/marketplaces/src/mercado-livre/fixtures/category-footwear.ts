/**
 * Part of `GET /categories/MLB273770/attributes` (Sandálias e Chinelos, where Mercado Livre puts
 * a "babuche" or a "chinelo") as the public API answered on 2026-11-27; colour and size value
 * lists cut to two entries.
 */
export const FOOTWEAR_CATEGORY = { id: "MLB273770", name: "Sandálias e Chinelos" };

export const FOOTWEAR_ATTRIBUTES = [
  {
    id: "BRAND",
    name: "Marca",
    tags: { catalog_required: true, required: true, grid_filter: true },
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
    tags: { allow_variations: true, defines_picture: true, required: true },
    value_type: "string",
    values: [
      { id: "52049", name: "Preto" },
      { id: "52055", name: "Branco" },
    ],
  },
  {
    id: "SIZE",
    name: "Tamanho",
    tags: { allow_variations: true, required: true },
    value_type: "string",
    values: [
      { id: "3189094", name: "16" },
      { id: "3189096", name: "17" },
    ],
  },
  {
    id: "FOOTWEAR_TYPE",
    name: "Tipo de calçado",
    tags: { catalog_required: true, required: true },
    value_type: "list",
    values: [
      { id: "517585", name: "Sandália" },
      { id: "517586", name: "Chinelo" },
      { id: "3630523", name: "Tamanco" },
      { id: "3630524", name: "Mule" },
    ],
  },
];
