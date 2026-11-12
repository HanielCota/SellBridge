import type { DueNotificationDelivery } from "@sellbridge/database/repositories";
import {
  markShipmentInvoiceAuthorized,
  queueNewShipmentInvoices,
} from "@sellbridge/database/repositories";
import { createInvoiceScenario } from "@sellbridge/database/testing/shipment-invoice";
import { schema } from "@sellbridge/database";
import { marketplaceError } from "@sellbridge/marketplaces";
import { NOTIFICATION_MAX_ATTEMPTS } from "@sellbridge/shared/notification-content";
import type { InvoiceFileKind } from "@sellbridge/shared/supplier-invoice";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createWorkerTestEnvironment } from "../testing/fixtures.ts";
import {
  createInvoiceAttachments,
  type InvoiceAttachmentDependencies,
} from "./invoice-attachments.ts";

const { database } = createWorkerTestEnvironment();
const cleanups: (() => Promise<void>)[] = [];
const ACCESS_KEY = "31261111222333000181550010000012341000012345";

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

afterAll(async () => {
  await database.$client.end();
});

async function authorizedParcel(): Promise<string> {
  const created = await createInvoiceScenario(database);
  cleanups.push(created.cleanup);
  await queueNewShipmentInvoices(database);
  const [invoice] = await database
    .select({ id: schema.shipmentInvoices.id })
    .from(schema.shipmentInvoices)
    .where(eq(schema.shipmentInvoices.shipmentId, created.shipmentId));
  if (invoice === undefined) {
    throw new Error("invoice not queued");
  }
  await markShipmentInvoiceAuthorized(database, {
    invoiceId: invoice.id,
    number: "1234",
    series: "1",
    accessKey: ACCESS_KEY,
    danfeUrl: null,
    authorizedAt: new Date(),
  });
  return created.shipmentId;
}

function deliveryAbout(shipmentId: string | undefined, attempts = 0): DueNotificationDelivery {
  return {
    id: crypto.randomUUID(),
    tenantId: null,
    recipientId: "user-1",
    recipientEmail: "revenda@sellbridge.test",
    event: "invoice_authorized",
    channel: "email",
    attempts,
    content: {
      subject: "Nota fiscal do pedido #1",
      preview: "",
      heading: "A nota fiscal foi emitida",
      paragraphs: ["Texto"],
      actionLabel: "Abrir o pedido",
      actionPath: "/pedidos/abc",
      footnote: "",
      ...(shipmentId === undefined ? {} : { invoiceShipmentId: shipmentId }),
    },
  };
}

const FILES: Record<InvoiceFileKind, string> = { xml: "<nfeProc/>", danfe: "%PDF-1.4" };

function fileReader() {
  return vi.fn<InvoiceAttachmentDependencies["readFile"]>(async (_files, kind) =>
    new TextEncoder().encode(FILES[kind]),
  );
}

describe("invoice attachments", () => {
  it("attaches the parcel's XML and DANFE named by the note's number", async () => {
    const shipmentId = await authorizedParcel();
    const attachmentsFor = createInvoiceAttachments({ database, readFile: fileReader() });

    const attachments = await attachmentsFor(deliveryAbout(shipmentId));

    expect(
      attachments.map((file) => [file.filename, new TextDecoder().decode(file.content)]),
    ).toEqual([
      ["nfe-1234.xml", "<nfeProc/>"],
      ["danfe-1234.pdf", "%PDF-1.4"],
    ]);
  });

  it("attaches nothing to an e-mail that is not about a note", async () => {
    const readFile = fileReader();
    const attachmentsFor = createInvoiceAttachments({ database, readFile });

    const attachments = await attachmentsFor(deliveryAbout(undefined));

    expect(attachments).toEqual([]);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("waits for a later attempt when Bling is briefly out", async () => {
    const shipmentId = await authorizedParcel();
    const attachmentsFor = createInvoiceAttachments({
      database,
      readFile: async () => {
        throw marketplaceError("Bling fora do ar", { retryable: true, status: 503 });
      },
    });

    const attempt = attachmentsFor(deliveryAbout(shipmentId));

    await expect(attempt).rejects.toMatchObject({ details: { retryable: true } });
  });

  it("sends without the files on the last attempt", async () => {
    const shipmentId = await authorizedParcel();
    const attachmentsFor = createInvoiceAttachments({
      database,
      readFile: async () => {
        throw marketplaceError("Bling fora do ar", { retryable: true, status: 503 });
      },
    });

    const attachments = await attachmentsFor(
      deliveryAbout(shipmentId, NOTIFICATION_MAX_ATTEMPTS - 1),
    );

    expect(attachments).toEqual([]);
  });
});
