import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import { schema } from "@sellbridge/database";
import { createWebhookEndpoint, recordApiEvent } from "@sellbridge/database/repositories";
import { verifyWebhookSignature } from "@sellbridge/shared/webhook-signature";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestTenants, createWorkerTestEnvironment } from "../testing/fixtures.ts";
import { createWebhookDeliveryProcessor } from "./webhook-delivery.ts";

const environment = createWorkerTestEnvironment();
const { database, cipher } = environment;
const secret = "whsec_teste_do_worker";

interface ReceivedRequest {
  headers: IncomingHttpHeaders;
  body: string;
}

const received: ReceivedRequest[] = [];
let responseStatus = 200;
let server: Server;
let baseUrl = "";
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let tenantId = "";

const orderData = {
  orderId: "00000000-0000-4000-8000-0000000000aa",
  externalOrderId: "ORD-WORKER",
  storeId: "00000000-0000-4000-8000-0000000000bb",
  status: "paid",
  previousStatus: null,
  totalCents: 2500,
  orderedAt: "2026-01-01T00:00:00.000Z",
};

beforeAll(async () => {
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.push({ headers: request.headers, body: Buffer.concat(chunks).toString("utf8") });
      response.writeHead(responseStatus).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("servidor de teste sem porta");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
  tenants = await createTestTenants(database, 1);
  tenantId = tenants.first;
});

afterAll(async () => {
  await tenants.cleanup();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await database.$client.end();
});

async function createEndpoint(path: string) {
  return createWebhookEndpoint(database, tenantId, {
    url: `${baseUrl}${path}`,
    description: null,
    eventTypes: [],
    secretEnc: cipher.encrypt(secret),
  });
}

async function deliveriesOf(endpointId: string) {
  return database
    .select()
    .from(schema.webhookDeliveries)
    .where(eq(schema.webhookDeliveries.endpointId, endpointId));
}

describe("webhook-delivery processor", () => {
  it("POSTs the signed event and marks the delivery as succeeded", async () => {
    const endpoint = await createEndpoint("/ok");
    const eventId = await recordApiEvent(database, {
      tenantId,
      type: "order.created",
      data: orderData,
    });
    responseStatus = 204;
    const deliver = createWebhookDeliveryProcessor({
      database,
      cipher,
      allowPrivateUrls: true,
      tenantId,
    });
    const summary = await deliver();
    expect(summary.delivered).toBeGreaterThanOrEqual(1);

    const request = received.find((item) => item.headers["sellbridge-event-id"] === eventId);
    expect(request?.headers["sellbridge-event-type"]).toBe("order.created");
    expect(request?.headers["user-agent"]).toBe("SellBridge-Webhooks/1.0");
    expect(JSON.parse(request?.body ?? "{}")).toMatchObject({
      id: eventId,
      type: "order.created",
      data: orderData,
    });
    const header = request?.headers["sellbridge-signature"];
    expect(
      verifyWebhookSignature({
        secret,
        header: typeof header === "string" ? header : "",
        body: request?.body ?? "",
      }),
    ).toBe(true);
    const [delivery] = await deliveriesOf(endpoint.id);
    expect(delivery).toMatchObject({ status: "succeeded", attempts: 1, lastStatusCode: 204 });
  });

  it("schedules a retry when the receiver fails", async () => {
    const endpoint = await createEndpoint("/fail");
    await recordApiEvent(database, { tenantId, type: "order.created", data: orderData });
    responseStatus = 500;
    const now = new Date();
    const deliver = createWebhookDeliveryProcessor({
      database,
      cipher,
      allowPrivateUrls: true,
      now: () => now,
      tenantId,
    });
    await deliver();
    const [delivery] = await deliveriesOf(endpoint.id);
    expect(delivery).toMatchObject({
      status: "pending",
      attempts: 1,
      lastStatusCode: 500,
      lastError: "HTTP 500",
    });
    expect(delivery?.nextAttemptAt.getTime()).toBe(now.getTime() + 30_000);
  });

  it("refuses private addresses unless allowed, without calling the receiver", async () => {
    const endpoint = await createEndpoint("/private");
    await recordApiEvent(database, { tenantId, type: "order.created", data: orderData });
    const before = received.length;
    const deliver = createWebhookDeliveryProcessor({
      database,
      cipher,
      allowPrivateUrls: false,
      tenantId,
    });
    await deliver();
    const [delivery] = await deliveriesOf(endpoint.id);
    expect(delivery).toMatchObject({ status: "pending", attempts: 1, lastStatusCode: null });
    expect(delivery?.lastError).toContain("não público");
    expect(received.filter((item) => item.headers["sellbridge-signature"])).toHaveLength(before);
  });
});
