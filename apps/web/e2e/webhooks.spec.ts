import { createHmac, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";
import { requireEnvironmentVariable } from "./environment";

const MOCK_SECRET = requireEnvironmentVariable("MOCK_WEBHOOK_SECRET");

function sign(body: string): string {
  return createHmac("sha256", MOCK_SECRET).update(body).digest("hex");
}

test.describe("endpoint de webhooks", () => {
  test("recusa assinatura inválida e marketplace desconhecido", async ({ request }) => {
    const body = JSON.stringify({ id: randomUUID(), topic: "orders", shopId: "x", resource: "y" });
    const invalid = await request.post("/api/webhooks/mock", {
      data: body,
      headers: { "content-type": "application/json", "x-mock-signature": "00" },
    });
    expect(invalid.status()).toBe(401);
    const unknown = await request.post("/api/webhooks/amazon", { data: body });
    expect(unknown.status()).toBe(404);
  });

  test("aceita o evento uma vez e reconhece reenvios como duplicados", async ({ request }) => {
    const body = JSON.stringify({
      id: randomUUID(),
      topic: "questions",
      shopId: "x",
      resource: "y",
    });
    const headers = { "content-type": "application/json", "x-mock-signature": sign(body) };
    const first = await request.post("/api/webhooks/mock", { data: body, headers });
    expect(first.status()).toBe(200);
    expect(await first.json()).toEqual({ status: "recebido" });
    const retry = await request.post("/api/webhooks/mock", { data: body, headers });
    expect(await retry.json()).toEqual({ status: "duplicado" });
  });

  test("recusa payloads grandes demais", async ({ request }) => {
    const body = JSON.stringify({ id: randomUUID(), topic: "orders", padding: "x".repeat(70_000) });
    const response = await request.post("/api/webhooks/mock", {
      data: body,
      headers: { "content-type": "application/json", "x-mock-signature": sign(body) },
    });
    expect(response.status()).toBe(413);
  });
});

test("venda simulada chega por webhook e aparece no financeiro", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/publicacoes?status=published");
  await page.getByRole("button", { name: "Simular venda" }).first().click();
  await expect(
    page.getByText("Venda simulada enviada. Ela aparece no financeiro em instantes."),
  ).toBeVisible();

  await expect(async () => {
    await page.goto("/financeiro?period=7d&query=SIM-", { waitUntil: "networkidle" });
    await expect(page.getByText(/^SIM-[0-9A-F]{8}$/).first()).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
});
