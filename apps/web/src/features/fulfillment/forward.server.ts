import {
  forwardOrder,
  forwardRecipients,
  noteSupplierEmailFailed,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import type { forwardOrderSchema } from "@sellbridge/shared/schemas";
import { emailSupplierLinks } from "@sellbridge/shared/supplier-order-email";
import type { z } from "zod";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { sendEmail } from "@/lib/server/mailer";

/** A parcel just forwarded: its supplier link, and whether it already went out by e-mail. */
export interface ForwardedLink {
  shipmentId: string;
  supplierId: string;
  token: string;
  emailed: boolean;
}

/**
 * The reseller's forward, plus an e-mail with the link to every supplier that has an order
 * e-mail (item 21.b). The e-mail never undoes the forward: a failed one is noted in the parcel's
 * history and the reseller shares the link by hand, as before. Logs carry ids only.
 */
export async function forwardAndNotify(
  tenantId: string,
  input: z.infer<typeof forwardOrderSchema>,
): Promise<ForwardedLink[]> {
  const links = await forwardOrder(database, tenantId, input);
  const recipients = await forwardRecipients(
    database,
    tenantId,
    links.map((link) => link.shipmentId),
  );
  const emailed = await emailSupplierLinks({
    recipients,
    links,
    appUrl: environment.APP_URL,
    send: sendEmail,
    onFailure: async (shipmentId, error) => {
      await noteSupplierEmailFailed(database, tenantId, shipmentId);
      logger.warn("fulfillment.supplier_email_failed", {
        orderId: input.orderId,
        shipmentId,
        error,
      });
    },
  });
  return links.map((link) => ({ ...link, emailed: emailed.has(link.shipmentId) }));
}
