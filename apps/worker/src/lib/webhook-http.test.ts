import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sendWebhookRequest } from "./webhook-http.ts";

let server: Server;
let port = 0;
let received = 0;
let trickleClosed: Promise<void> = Promise.resolve();

beforeAll(async () => {
  server = createServer((request, response) => {
    received += 1;
    request.resume();
    if (request.url !== "/trickle") {
      response.writeHead(204).end();
      return;
    }
    // Answers 200 at once, then sends one byte every 50 ms and never ends.
    response.writeHead(200);
    const timer = setInterval(() => response.write("."), 50);
    trickleClosed = new Promise<void>((resolve) =>
      response.on("close", () => {
        clearInterval(timer);
        resolve();
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address: AddressInfo | string | null = server.address();
  port = typeof address === "object" && address ? address.port : 0;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function webhookTo(allowPrivateUrls: boolean) {
  return {
    url: `http://localhost:${port}/hook`,
    headers: { "content-type": "application/json" },
    body: "{}",
    timeoutMilliseconds: 2000,
    allowPrivateUrls,
  };
}

describe("sendWebhookRequest", () => {
  it("delivers when private addresses are allowed (local development)", async () => {
    expect(await sendWebhookRequest(webhookTo(true))).toBe(204);
  });

  it("closes the connection once the status arrives, even if the body never ends", async () => {
    const status = await sendWebhookRequest({
      ...webhookTo(true),
      url: `http://localhost:${port}/trickle`,
    });
    expect(status).toBe(200);
    await trickleClosed;
  });

  it("refuses at connection time a host that resolves to a private address", async () => {
    const before = received;
    await expect(sendWebhookRequest(webhookTo(false))).rejects.toThrow("não público");
    expect(received).toBe(before);
  });

  it("closes the socket of a receiver that trickles its body after the status", async () => {
    const trickling = { ...webhookTo(true), url: `http://localhost:${port}/trickle` };
    expect(await sendWebhookRequest(trickling)).toBe(200);
    await trickleClosed;
  });
});
