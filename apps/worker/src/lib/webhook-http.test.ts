import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sendWebhookRequest } from "./webhook-http.ts";

let server: Server;
let port = 0;
let received = 0;

beforeAll(async () => {
  server = createServer((request, response) => {
    received += 1;
    request.resume();
    response.writeHead(204).end();
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

  it("refuses at connection time a host that resolves to a private address", async () => {
    const before = received;
    await expect(sendWebhookRequest(webhookTo(false))).rejects.toThrow("não público");
    expect(received).toBe(before);
  });
});
