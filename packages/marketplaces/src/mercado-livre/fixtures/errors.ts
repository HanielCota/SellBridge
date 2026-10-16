/**
 * Error bodies of `POST /items` as the official "Validações" page shows them
 * (developers.mercadolivre.com.br/pt_br/validacoes, read on 2026-10-15): the envelope and the
 * `cause[]` fields are the page's, and so are the cause ids, codes and English messages of its
 * table; the attribute, category and size values are ours.
 */
const envelope = { message: "Validation error", error: "validation_error", status: 400 };

/** The page's own example: three warnings and one blocking moderation error. */
const documentationExample = {
  ...envelope,
  cause: [
    {
      department: "structured-data",
      cause_id: 2511,
      type: "warning",
      code: "create.item.attribute.business_conditional",
      references: ["item.attributes"],
      message: "Attribute [AGE_GROUP] to be added with values [(6725189,null)]",
    },
    {
      department: "moderations",
      cause_id: 3250,
      type: "error",
      code: "moderations.seller.not_authorized",
      references: ["item.seller_id", "item.category_id", "item.attributes[0]"],
      message: "Seller is not authorized for this brand and category",
    },
    {
      department: "structured-data",
      cause_id: 1212,
      type: "warning",
      code: "normalize.item.attribute.values",
      references: ["item.variations[0].attribute_combinations[1].values"],
      message:
        "Attribute [SIZE] to be modified - values [(null,32.5 BR)] should be [(11375386,32.5 BR)] - Normalized form: [migration]",
    },
    {
      department: "shipping",
      cause_id: 4029,
      type: "warning",
      code: "shipping.me2_adoption_mandatory",
      references: ["shipping.modes", "user.shipping_preferences.option"],
      message: "ME2 adoption is mandatory for the user",
    },
  ],
};

function oneError(cause: {
  cause_id: number;
  code: string;
  references: string[];
  message: string;
}) {
  return { ...envelope, cause: [{ department: "items", type: "error", ...cause }] };
}

export const ERROR_FIXTURES = {
  documentationExample,
  missingRequiredAttributes: oneError({
    cause_id: 147,
    code: "item.attributes.missing_required",
    references: ["item.attributes"],
    message:
      "The attributes [BRAND, MODEL] are required for category MLB31447 and channel marketplace. Check the attribute is present in the attributes list or in all variation's attributes_combination or attributes.",
  }),
  categoryMinimumPrice: oneError({
    cause_id: 109,
    code: "item.price.invalid",
    references: ["item.price"],
    message: "The category MLB31447 requires a minimum price of 8.",
  }),
  smallPictures: oneError({
    cause_id: 3703,
    code: "item.pictures.invalid_size",
    references: ["item.pictures"],
    message: "The photos must have a minimum size of 500 pixels on at least one side.",
  }),
  shortTitle: oneError({
    cause_id: 3705,
    code: "item.title.minimum_length",
    references: ["item.title"],
    message:
      "You should include more main features in the title to differentiate it from other products.",
  }),
  /** Two blocking errors at once: both reach the reseller, the warning does not. */
  twoErrors: {
    ...envelope,
    cause: [
      {
        department: "items",
        cause_id: 3703,
        type: "error",
        code: "item.pictures.invalid_size",
        references: ["item.pictures"],
        message: "The photos must have a minimum size of 500 pixels on at least one side.",
      },
      {
        department: "shipping",
        cause_id: 4029,
        type: "warning",
        code: "shipping.me2_adoption_mandatory",
        references: ["shipping.modes"],
        message: "ME2 adoption is mandatory for the user",
      },
      {
        department: "structured-data",
        cause_id: 7810,
        type: "error",
        code: "item.attribute.missing_conditional_required",
        references: ["item.attributes"],
        message:
          "The attributes [GTIN] are required for category [MLB31447]. Check the attribute is present in the attributes list or in all variation's attributes_combination or attributes.",
      },
    ],
  },
  /** A code the table does not list: the marketplace's own words still reach the reseller. */
  unknownCode: oneError({
    cause_id: 9999,
    code: "item.something.new",
    references: ["item"],
    message: "Something new went wrong with this item.",
  }),
  /** Older endpoints answer with no `cause` at all. */
  withoutCause: { message: "attribute BRAND is required", error: "bad_request", status: 400 },
} as const;
