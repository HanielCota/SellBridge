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
  .describe(
    "Só para chaves com `buyers:personal`. Nulo quando o marketplace não mandou o endereço.",
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
  params: organizationParamsSchema.and(getOrder.params),
  query: noInput,
  response: dataEnvelope(orderDetailSchema.extend({ shippingAddress: shippingAddressSchema })),
  handle: async (input) => {
    const order = await readAsOrganization(getOrder, input);
    if (input.caller.scopes.includes(PERSONAL_DATA_SCOPE)) {
      const sealed = await findSealedShippingAddress(
        database,
        input.params.organizationId,
        input.params.orderId,
      );
      const shippingAddress = openShippingAddress(tokenCipher, sealed);
      return { data: { ...order.data, shippingAddress } };
    }
    return order;
  },
});
