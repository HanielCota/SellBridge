import { findSealedShippingAddress } from "@sellbridge/database/repositories";
import { PERSONAL_DATA_SCOPE } from "@sellbridge/shared/developer-api";
import { openShippingAddress } from "@sellbridge/marketplaces";
import { getOrder } from "@/features/public-api/endpoints/orders.server";
import { noInput } from "@/features/public-api/endpoint";
import { database } from "@/lib/server/database";
import { tokenCipher } from "@/lib/server/marketplaces";
import { defineDeveloperEndpoint } from "../developer-endpoint.server";
import { organizationParamsSchema, readAsOrganization } from "../organization-endpoint.server";

/**
 * One order, as the organization API shows it. The buyer's shipping address is added only for
 * keys with `buyers:personal`; without it the order carries the buyer's name alone.
 */
export const getDeveloperOrder = defineDeveloperEndpoint({
  operationId: "getOrder",
  scope: "orders:read",
  params: organizationParamsSchema.and(getOrder.params),
  query: noInput,
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
