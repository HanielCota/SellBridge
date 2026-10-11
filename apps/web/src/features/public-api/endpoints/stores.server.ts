import { listStoreConnections } from "@sellbridge/database/repositories";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { dataEnvelope, defineApiEndpoint, noInput } from "../endpoint";
import { presentStore, storeSchema } from "./stores.presenter";

/** Every store the organization has connected; disconnected ones are left out. */
export const listStores = defineApiEndpoint({
  method: "GET",
  path: "/stores",
  operationId: "listStores",
  tag: "Lojas",
  summary: "Listar lojas conectadas",
  description:
    "Lojas de marketplace conectadas à organização, na ordem em que foram conectadas. Use o `id` para criar anúncios e filtrar pedidos.",
  scope: "stores:read",
  params: noInput,
  query: noInput,
  body: noInput,
  response: dataEnvelope(z.array(storeSchema)),
  handle: async ({ context }) => {
    const stores = await listStoreConnections(database, context.tenantId);
    return { data: stores.flatMap((store) => presentStore(store) ?? []) };
  },
});
