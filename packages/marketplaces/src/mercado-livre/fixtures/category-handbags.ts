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
    id: "HANDBAG_TYPE",
    name: "Tipo de bolsa",
    tags: {},
    value_type: "string",
    values: [
      {
        id: "3141066",
        name: "Transversal",
      },
      {
        id: "3828690",
        name: "Tote",
      },
      {
        id: "433693",
        name: "Clutch",
      },
    ],
  },
  {
    id: "COLOR",
    name: "Cor",
    tags: {
      allow_variations: true,
      defines_picture: true,
    },
    value_type: "string",
    values: [
      {
        id: "283148",
        name: "Coral-claro",
      },
      {
        id: "283149",
        name: "Coral",
      },
      {
        id: "283150",
        name: "Laranja-claro",
      },
    ],
  },
  {
    id: "EXTERNAL_MATERIAL",
    name: "Material externo",
    tags: {},
    value_type: "string",
    values: [
      {
        id: "5609743",
        name: "Couro",
      },
      {
        id: "10975237",
        name: "Plástico",
      },
    ],
  },
  {
    id: "MAIN_COLOR",
    name: "Cor principal",
    tags: {
      variation_attribute: true,
    },
    value_type: "list",
    values: [
      {
        id: "2450295",
        name: "Preto",
      },
      {
        id: "2450293",
        name: "Azul",
      },
      {
        id: "2450307",
        name: "Vermelho",
      },
    ],
  },
  {
    id: "WITH_CLOSING",
    name: "Com fecho",
    tags: {},
    value_type: "boolean",
    values: [
      {
        id: "242084",
        name: "Não",
      },
      {
        id: "242085",
        name: "Sim",
      },
    ],
  },
  {
    id: "WITH_INTERNAL_LINING",
    name: "Com forro interno",
    tags: {},
    value_type: "boolean",
    values: [
      {
        id: "242084",
        name: "Não",
      },
      {
        id: "242085",
        name: "Sim",
      },
    ],
  },
  {
    id: "IS_REVERSIBLE",
    name: "É reversível",
    tags: {},
    value_type: "boolean",
    values: [
      {
        id: "242084",
        name: "Não",
      },
      {
        id: "242085",
        name: "Sim",
      },
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
