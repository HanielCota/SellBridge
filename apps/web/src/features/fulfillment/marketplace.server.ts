import { and, eq } from "drizzle-orm";
import { getMercadoLivreLabel, getMercadoLivreShipping } from "@sellbridge/marketplaces";
import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import { orders, orderShipments, storeConnections } from "@sellbridge/database/schema";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { tokenCipher } from "@/lib/server/marketplaces";

async function shippingAccess(tenantId: string, orderId: string) {
  const [row] = await database
    .select({
      externalOrderId: orders.externalOrderId,
      orderStatus: orders.status,
      store: storeConnections,
    })
    .from(orders)
    .innerJoin(storeConnections, eq(storeConnections.id, orders.storeConnectionId))
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.tenantId, tenantId),
        eq(storeConnections.tenantId, tenantId),
      ),
    );
  if (!row) throw notFoundError("Pedido não encontrado");
  if (row.store.marketplace !== "mercado_livre")
    throw conflictError(
      "Consulta automática e etiqueta de postagem disponíveis para Mercado Livre. Nos demais envios, registre a transportadora e o rastreio manualmente.",
    );
  if (row.store.status !== "connected" || !row.store.accessTokenEnc)
    throw conflictError("Reconecte a loja para consultar o envio");
  if (row.store.expiresAt && row.store.expiresAt.getTime() <= Date.now())
    throw conflictError("Token da loja expirado. Aguarde a renovação ou reconecte a loja.");
  return {
    config: {
      clientId: environment.MERCADO_LIVRE_CLIENT_ID,
      clientSecret: environment.MERCADO_LIVRE_CLIENT_SECRET,
    },
    store: {
      externalShopId: row.store.externalShopId,
      accessToken: tokenCipher.decrypt(row.store.accessTokenEnc),
    },
    externalOrderId: row.externalOrderId,
    orderStatus: row.orderStatus,
  };
}
export async function loadMarketplaceShipping(tenantId: string, orderId: string) {
  const access = await shippingAccess(tenantId, orderId);
  return getMercadoLivreShipping(access.config, access.store, access.externalOrderId);
}
export async function loadMarketplaceLabel(tenantId: string, orderId: string) {
  const shipments = await database
    .select({ id: orderShipments.id })
    .from(orderShipments)
    .where(and(eq(orderShipments.tenantId, tenantId), eq(orderShipments.orderId, orderId)));
  if (shipments.length > 1)
    throw conflictError(
      "Este pedido foi dividido entre fornecedores. A etiqueta única do marketplace não pode ser usada em volumes separados; organize a coleta em um único volume ou contrate envios individuais.",
    );
  const access = await shippingAccess(tenantId, orderId);
  if (["pending", "cancelled", "returned"].includes(access.orderStatus))
    throw conflictError("Pedido sem liberação para envio");
  return getMercadoLivreLabel(access.config, access.store, access.externalOrderId);
}
