import {
  findShipmentInvoiceFiles,
  type DueNotificationDelivery,
  type ShipmentInvoiceFiles,
} from "@sellbridge/database/repositories";
import type { Database } from "@sellbridge/database";
import { isRetryableError } from "@sellbridge/marketplaces";
import { logger } from "@sellbridge/shared/logger";
import type { EmailAttachment } from "@sellbridge/shared/mailer";
import { NOTIFICATION_MAX_ATTEMPTS } from "@sellbridge/shared/notification-content";
import {
  INVOICE_FILE_FORMATS,
  INVOICE_FILE_KINDS,
  invoiceFileName,
  type InvoiceFileKind,
} from "@sellbridge/shared/supplier-invoice";
import { supplierBlingClient, type ErpBlingDependencies } from "../processors/erp-bling-client.ts";
import type { EmailAttachmentsFor } from "./notification-channels.ts";

export interface InvoiceAttachmentDependencies {
  readonly database: Database;
  /** Reads one of the note's files from the supplier's ERP. */
  readonly readFile: (files: ShipmentInvoiceFiles, kind: InvoiceFileKind) => Promise<Uint8Array>;
}

/** A retry may still bring the files; the last attempt goes out without them. */
function worthRetrying(delivery: DueNotificationDelivery, error: unknown): boolean {
  return isRetryableError(error) && delivery.attempts + 1 < NOTIFICATION_MAX_ATTEMPTS;
}

/**
 * The XML and DANFE of the parcel the e-mail is about, read from the supplier's Bling when the
 * e-mail goes out. Without them the e-mail still goes: its text points to the order page, which
 * keeps both files.
 */
export function createInvoiceAttachments(
  dependencies: InvoiceAttachmentDependencies,
): EmailAttachmentsFor {
  return async function invoiceAttachments(delivery) {
    const shipmentId = delivery.content.invoiceShipmentId;
    if (shipmentId === undefined) {
      return [];
    }
    const files = await findShipmentInvoiceFiles(dependencies.database, shipmentId);
    if (files === null) {
      return [];
    }
    try {
      return await Promise.all(
        INVOICE_FILE_KINDS.map(async (kind): Promise<EmailAttachment> => ({
          filename: invoiceFileName(files, kind),
          content: await dependencies.readFile(files, kind),
        })),
      );
    } catch (error) {
      if (worthRetrying(delivery, error)) {
        throw error;
      }
      logger.warn("notification.invoice_files_left_out", {
        deliveryId: delivery.id,
        shipmentId,
        error,
      });
      return [];
    }
  };
}

/** Reads the files from the supplier's Bling; without the app keys there is nothing to read. */
export function blingInvoiceFileReader(
  dependencies: ErpBlingDependencies,
): InvoiceAttachmentDependencies["readFile"] {
  return async function readFile(files, kind) {
    const credentials = dependencies.blingCredentials;
    if (credentials === null) {
      throw new Error("Bling app keys are not set: the NF-e files cannot be read");
    }
    const client = supplierBlingClient(
      { ...dependencies, blingCredentials: credentials },
      files.supplierId,
    );
    return client.getInvoiceDocument(files.accessKey, INVOICE_FILE_FORMATS[kind]);
  };
}
