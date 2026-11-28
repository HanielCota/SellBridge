import { findSealedShippingAddress } from "@sellbridge/database/repositories";
import { PERSONAL_DATA_SCOPE } from "@sellbridge/shared/developer-api";
import { openShippingAddress } from "@sellbridge/marketplaces";
import { z } from "zod";
import { dataEnvelope, noInput } from "@/features/public-api/endpoint";
import { getOrder } from "@/features/public-api/endpoints/orders.server";
import { orderDetailSchema } from "@/features/public-api/endpoints/orders.presenter";
import { database } from "@/lib/server/database";
import { tokenCipher } from "@/lib/server/marketplaces";
import { defineDeveloperEndpoint } from "../developer-endpoint.server";
import { organizationParamsSchema, readAsOrganization } from "../organization-endpoint.server";

const shippingAddressSchema = z
  .object({
    recipient: z.string(),
    street: z.string(),
    number: z.string(),
    complement: z.string(),
    neighborhood: z.string(),
    city: z.string(),
    state: z.string(),
    postalCode: z.string(),
  })
  .nullable()
  .optional()
  .describe("Só para chaves com `buyers:personal`. Veja `shippingAddressStatus` se vier nulo.");

const shippingAddressStatusSchema = z
  .enum(["available", "missing", "unreadable"])
  .optional()
  .describe(
    "Só para chaves com `buyers:personal`. `available`: endereço disponível; `missing`: sem endereço salvo; `unreadable`: endereço salvo que não pôde ser lido.",
  );

const orderResponseSchema = dataEnvelope(
  orderDetailSchema.extend({
    shippingAddress: shippingAddressSchema,
    shippingAddressStatus: shippingAddressStatusSchema,
  }),
);

/**
 * One order, as the organization API shows it. The buyer's shipping address is added only for
 * keys with `buyers:personal`; without it the order carries the buyer's name alone.
 */
export const getDeveloperOrder = defineDeveloperEndpoint({
  path: "/organizations/{organizationId}/orders/{orderId}",
  operationId: "getOrder",
  tag: getOrder.tag,
  summary: getOrder.summary,
  description: `${getOrder.description ?? ""} Com \`buyers:personal\`, traz também o endereço de entrega do comprador.`,
  scope: "orders:read",
  sendsPersonalData: (caller) => caller.scopes.includes(PERSONAL_DATA_SCOPE),
  params: organizationParamsSchema.and(getOrder.params),
  query: noInput,
  response: orderResponseSchema,
  handle: async (input): Promise<z.input<typeof orderResponseSchema>> => {
    const order = await readAsOrganization(getOrder, input);
    if (!input.caller.scopes.includes(PERSONAL_DATA_SCOPE)) {
      return order;
    }
    const sealed = await findSealedShippingAddress(
      database,
      input.params.organizationId,
      input.params.orderId,
    );
    if (sealed === null) {
      return { data: { ...order.data, shippingAddress: null, shippingAddressStatus: "missing" } };
    }
    const shippingAddress = openShippingAddress(tokenCipher, sealed);
    const shippingAddressStatus = shippingAddress === null ? "unreadable" : "available";
    return { data: { ...order.data, shippingAddress, shippingAddressStatus } };
  },
});
