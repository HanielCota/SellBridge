import { z } from "zod";
import type { AccountAddress, AccountAddressType } from "@sellbridge/shared/buyer-address";
import type { StoreCredentials } from "../types.ts";
import { marketplaceError } from "../errors.ts";
import { requestJson, type MercadoLivreConfig } from "./client.ts";

/**
 * The seller account's addresses, as the "Endereços do usuário" guide shows them
 * (developers.mercadolivre.com.br/pt_br/enderecos-do-usuario, read on 2026-11-17): read with the
 * default "Usuários" permission every app has. Only the CEP, street, number, types and status are
 * kept; contact, phone and coordinates are dropped by the schema and nothing is logged or stored.
 */

const addressSchema = z.object({
  zip_code: z.string().nullish(),
  street_name: z.string().nullish(),
  street_number: z.union([z.string(), z.number()]).nullish(),
  types: z.array(z.string()).nullish(),
  status: z.string().nullish(),
});

// The guide's example is a single address; the call lists every address of the account.
const addressesSchema = z.union([z.array(addressSchema), addressSchema]);

type MercadoLivreAddress = z.infer<typeof addressSchema>;

/**
 * The guide writes the shipping and billing types in Portuguese ("envio", "cobrança") while its
 * example says "shipping": every spelling is accepted until a real account shows which one comes.
 */
const ADDRESS_TYPES: Readonly<Record<string, AccountAddressType>> = {
  default_buying_address: "buying",
  default_selling_address: "selling",
  shipping: "shipping",
  envio: "shipping",
  billing: "billing",
  cobranca: "billing",
};

function typeOf(raw: string): AccountAddressType | null {
  const key = raw
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
  return ADDRESS_TYPES[key] ?? null;
}

function textOrNull(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text === "" ? null : text;
}

export function toAccountAddress(address: MercadoLivreAddress): AccountAddress {
  const types = (address.types ?? []).flatMap((raw) => {
    const type = typeOf(raw);
    return type === null ? [] : [type];
  });
  return {
    zipCode: textOrNull(address.zip_code),
    street: textOrNull(address.street_name),
    number: textOrNull(address.street_number),
    types,
  };
}

/** The active addresses of the store's account; an inactive one no longer receives anything. */
export async function readMercadoLivreAccountAddresses(
  config: MercadoLivreConfig,
  store: StoreCredentials,
): Promise<AccountAddress[]> {
  if (!/^\d+$/.test(store.externalShopId)) {
    throw marketplaceError("Conta do Mercado Livre inválida", { retryable: false });
  }
  const context = {
    config,
    fetchImplementation: config.fetchImplementation ?? fetch,
    now: config.now ?? (() => new Date()),
  };
  const response = await requestJson(context, {
    schema: addressesSchema,
    path: `/users/${store.externalShopId}/addresses`,
    init: { accessToken: store.accessToken },
  });
  const addresses = Array.isArray(response) ? response : [response];
  return addresses.filter((address) => address.status !== "inactive").map(toAccountAddress);
}
