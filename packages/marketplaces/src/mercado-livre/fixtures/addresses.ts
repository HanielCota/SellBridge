/**
 * Addresses as `GET /users/{id}/addresses` returns them. Field names follow the official
 * "Endereços do usuário" page (developers.mercadolivre.com.br/pt_br/enderecos-do-usuario, read on
 * 2026-11-17); the values are ours (the docs' example is an address in Argentina).
 */
function address(fields: {
  id: number;
  zipCode: string;
  streetName: string;
  streetNumber: string;
  types: string[];
  status?: string;
}) {
  return {
    id: fields.id,
    user_id: 770001234,
    contact: "Pessoa de Teste",
    phone: "11 99999-0000",
    address_line: `${fields.streetName} ${fields.streetNumber}`,
    floor: "",
    apartment: "",
    street_number: fields.streetNumber,
    street_name: fields.streetName,
    zip_code: fields.zipCode,
    city: { id: "BR-SP-44", name: "São Paulo" },
    state: { id: "BR-SP", name: "São Paulo" },
    country: { id: "BR", name: "Brasil" },
    neighborhood: { id: null, name: "Centro" },
    municipality: { id: null, name: null },
    search_location: {
      state: { id: "TUxCUFNBT085N2E4", name: "São Paulo" },
      city: { id: "TUxCQ1NBTzQyNjE", name: "São Paulo" },
      neighborhood: { id: "TUxCQkNFTjM3OTE", name: "Centro" },
    },
    types: fields.types,
    comment: "",
    geolocation_type: "RANGE_INTERPOLATED",
    latitude: -23.5505,
    longitude: -46.6333,
    status: fields.status ?? "active",
    date_created: "2026-01-05T12:26:54.000-03:00",
    normalized: true,
    open_hours: { on_holidays: { hours: [], status: "closed" } },
  };
}

/** The supplier's warehouse, where the account ships from and sells. */
export const SUPPLIER_WAREHOUSE_ADDRESS = address({
  id: 1101,
  zipCode: "30130110",
  streetName: "Avenida Afonso Pena",
  streetNumber: "1500",
  types: ["default_selling_address", "shipping"],
});

/** The reseller's home, marked for purchases. */
export const RESELLER_HOME_ADDRESS = address({
  id: 1102,
  zipCode: "01310100",
  streetName: "Rua Augusta",
  streetNumber: "200",
  types: ["default_buying_address"],
});

/** The supplier's warehouse, marked for everything: personal purchases go there. */
export const SUPPLIER_WAREHOUSE_FOR_EVERYTHING = address({
  id: 1103,
  zipCode: "30130110",
  streetName: "Avenida Afonso Pena",
  streetNumber: "1500",
  types: ["default_buying_address", "default_selling_address", "envio", "cobrança"],
});

/** An old address the reseller removed. */
export const INACTIVE_ADDRESS = address({
  id: 1104,
  zipCode: "30130110",
  streetName: "Avenida Afonso Pena",
  streetNumber: "1500",
  types: ["default_buying_address"],
  status: "inactive",
});
