import { getSupplierPanelShipment } from "@sellbridge/database/repositories";
import { conflictError, forbiddenError } from "@sellbridge/shared/errors";
import { z } from "zod";
import { requestedProfileOf } from "../profile-param.ts";
import { database } from "./database.ts";
import { assertSupplierPanelAccess } from "./supplier-panel-access.ts";
import { resolveSupplierPanelViewer } from "./supplier-panel-viewer.ts";
import { requireTenantSession } from "./tenant-session.ts";

const panelLabelFormSchema = z.object({ supplierId: z.uuid(), shipmentId: z.uuid() });

/** Whether the label form came from the supplier panel (ids) rather than the link (token). */
export function panelLabelIds(form: URLSearchParams | null) {
  const parsed = panelLabelFormSchema.safeParse({
    supplierId: form?.get("supplierId"),
    shipmentId: form?.get("shipmentId"),
  });
  return parsed.success ? parsed.data : null;
}

/**
 * The parcel whose marketplace label a signed-in supplier may open: the same access rule as
 * every panel function (their own catalog, or the team), the parcel must belong to that supplier
 * and to this order, and it must still be on its way out (the label carries the buyer's address).
 * Before this, the panel had no label button and suppliers had to dig out the e-mailed link.
 */
export async function panelLabelShipmentId(
  request: Request,
  orderId: string,
  ids: { supplierId: string; shipmentId: string },
): Promise<string> {
  const session = await requireTenantSession(
    request.headers,
    requestedProfileOf({ headers: request.headers, url: request.url }),
  );
  assertSupplierPanelAccess(await resolveSupplierPanelViewer(session), ids.supplierId);
  const shipment = await getSupplierPanelShipment(database, ids);
  if (shipment.orderId !== orderId) {
    throw forbiddenError("Este envio não é deste pedido");
  }
  if (shipment.address === null) {
    throw conflictError("Este envio já foi encerrado");
  }
  return shipment.id;
}
