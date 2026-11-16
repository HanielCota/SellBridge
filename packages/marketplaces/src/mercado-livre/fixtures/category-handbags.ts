/**
 * Part of `GET /categories/MLB7022/attributes` (Bolsas) as the public API answered on
 * 2026-11-16, value lists cut to three entries.
 */
export const HANDBAG_ATTRIBUTES = [
  {
    id: "BRAND",
    name: "Marca",
    tags: { catalog_required: true, required: true },
    value_type: "string",
    value_max_length: 255,
    values: [
      { id: "498493", name: "47 Street" },
      { id: "471628", name: "Aldo" },
    ],
    hint: "Informe a marca verdadeira do produto ou 'Generic' se não tiver marca.",
  },
  {
    id: "MODEL",
    name: "Modelo",
    tags: { catalog_required: true, required: true },
    value_type: "string",
    value_max_length: 255,
    example: "Nina",
    values: [],
  },
  {
    id: "AGE_GROUP",
    name: "Idade",
    tags: { hidden: true, grid_filter: true },
    value_type: "list",
    values: [{ id: "6725189", name: "Adultos" }],
  },
  {
    id: "GENDER",
    name: "Gênero",
    tags: {},
    value_type: "list",
    values: [
      { id: "339665", name: "Feminino" },
      { id: "339668", name: "Meninas" },
    ],
  },
  {
    id: "IS_VEGAN",
    name: "É vegano",
    tags: {},
    value_type: "boolean",
    values: [
      { id: "242084", name: "Não", metadata: { value: false } },
      { id: "242085", name: "Sim", metadata: { value: true } },
    ],
  },
  {
    id: "GTIN",
    name: "Código universal de produto",
    tags: { conditional_required: true, multivalued: true },
    value_type: "string",
    values: [],
  },
  {
    id: "SELLER_PACKAGE_WEIGHT",
    name: "Peso da embalagem do vendor",
    tags: { hidden: true },
    value_type: "number_unit",
    allowed_units: [{ id: "g", name: "g" }],
    default_unit: "g",
    values: [],
  },
  {
    id: "PACKAGE_HEIGHT",
    name: "Altura do pacote",
    tags: { hidden: true, read_only: true },
    value_type: "number_unit",
    values: [],
  },
];
