import type { DeliveryAddress } from "@sellbridge/shared/schemas";
import type { Transaction } from "../client.ts";
import { orderShipments, shipmentEvents } from "../schema/index.ts";
import { FORWARD_CREDIT, type ForwardActor, type supplierGroups } from "./supplier-groups.ts";
import { issueSupplierLink } from "./supplier-link.ts";

type Groups = Awaited<ReturnType<typeof supplierGroups>>;
type Lines = Groups extends Map<string, infer TLines> ? TLines : never;
interface ParcelContext {
  transaction: Transaction;
  tenantId: string;
  orderId: string;
  address: DeliveryAddress;
  notes: string;
  actor: ForwardActor;
}

async function recordCreation(context: ParcelContext, shipmentId: string, own: boolean) {
  const credit = FORWARD_CREDIT[context.actor];
  const forwarded = { shipmentId, status: "forwarded" as const, ...credit };
  if (!own) {
    await context.transaction.insert(shipmentEvents).values(forwarded);
    return;
  }
  await context.transaction.insert(shipmentEvents).values([
    { ...forwarded, note: "Produtos próprios atribuídos ao revendedor para preparação e envio." },
    {
      shipmentId,
      status: "accepted",
      actor: credit.actor,
      note: "Pronto para o revendedor preparar e enviar.",
    },
  ]);
}

async function createParcel(context: ParcelContext, supplierId: string, lines: Lines) {
  const first = lines[0];
  if (first === undefined) throw new Error("Não é possível criar um envio sem itens.");
  const own = first.catalogKind === "seller";
  const link = own ? null : issueSupplierLink();
  const [shipment] = await context.transaction
    .insert(orderShipments)
    .values({
      tenantId: context.tenantId,
      orderId: context.orderId,
      supplierId,
      status: own ? "accepted" : "forwarded",
      address: context.address,
      notes: context.notes,
      items: lines.map(({ orderItemId, title, quantity, sku }) => ({
        orderItemId,
        title,
        quantity,
        sku: sku ?? "",
      })),
      supplierTokenHash: link?.hash ?? null,
      supplierTokenExpiresAt: link?.expiresAt ?? null,
    })
    .returning({ id: orderShipments.id });
  if (shipment === undefined) throw new Error("Não foi possível preparar o envio.");
  await recordCreation(context, shipment.id, own);
  if (link === null) return null;
  return { shipmentId: shipment.id, supplierId, token: link.token };
}

/** Own parcels stay internal; only external suppliers receive a bearer link. */
export async function createFulfillmentParcels(context: ParcelContext, groups: Groups) {
  const links: { shipmentId: string; supplierId: string; token: string }[] = [];
  for (const [sourceId, lines] of groups) {
    const link = await createParcel(context, sourceId, lines);
    if (link !== null) links.push(link);
  }
  return links;
}
