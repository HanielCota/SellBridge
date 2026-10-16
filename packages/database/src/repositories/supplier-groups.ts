import { conflictError } from "@sellbridge/shared/errors";
import { SHIPMENT_ACTORS } from "@sellbridge/shared/schemas";
import { and, eq } from "drizzle-orm";
import type { Transaction } from "../client.ts";
import { orderItems, supplierProducts, suppliers } from "../schema/index.ts";

/** Who a forward is credited to: the reseller by hand, or SellBridge on its own (item 21.b). */
export type ForwardActor = "reseller" | "sellbridge";

/** The first history step of each parcel, by who forwarded it. */
export const FORWARD_CREDIT: Record<ForwardActor, { actor: string; note: string }> = {
  reseller: {
    actor: SHIPMENT_ACTORS.reseller,
    note: "Ordem de fornecimento criada. Compartilhe o link com o fornecedor.",
  },
  sellbridge: {
    actor: SHIPMENT_ACTORS.sellbridge,
    note: "Pedido encaminhado automaticamente e enviado ao fornecedor por e-mail.",
  },
};

/** The order's items by supplier; refuses an order with an item of no active supplier. */
export async function supplierGroups(tx: Transaction, tenantId: string, orderId: string) {
  const items = await tx
    .select({
      orderItemId: orderItems.id,
      title: orderItems.title,
      quantity: orderItems.quantity,
      sku: supplierProducts.sku,
      supplierId: supplierProducts.supplierId,
      active: suppliers.active,
    })
    .from(orderItems)
    .leftJoin(supplierProducts, eq(supplierProducts.id, orderItems.supplierProductId))
    .leftJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .where(and(eq(orderItems.orderId, orderId), eq(orderItems.tenantId, tenantId)));
  const linked = items.filter(
    (item): item is (typeof items)[number] & { supplierId: string } =>
      item.supplierId !== null && item.active === true,
  );
  if (!items.length || linked.length !== items.length)
    throw conflictError("Vincule todos os itens a fornecedores ativos antes de encaminhar");
  const grouped = new Map<string, typeof linked>();
  for (const item of linked) {
    grouped.set(item.supplierId, [...(grouped.get(item.supplierId) ?? []), item]);
  }
  return grouped;
}
