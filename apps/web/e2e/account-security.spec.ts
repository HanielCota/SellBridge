import { expect, test } from "@playwright/test";
import { signUp, uniqueEmail } from "./helpers";

test("a reseller cannot create or delete organizations through the auth API", async ({ page }) => {
  await signUp(page, "Revendedora Uma Loja");
  const origin = new URL(page.url()).origin;
  const headers = { origin, "content-type": "application/json" };

  // A second organization would start a fresh free plan: more stores and listings for free.
  const create = await page.request.post("/api/auth/organization/create", {
    headers,
    data: { name: "Segunda loja", slug: `segunda-${Date.now()}` },
  });
  expect(create.status()).toBe(404);

  // Deleting the organization would cascade to every order, shipment and ticket.
  const remove = await page.request.post("/api/auth/organization/delete", {
    headers,
    data: { organizationId: "qualquer" },
  });
  expect(remove.status()).toBe(404);

  // The account keeps working on its one organization.
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("sign-up refuses a name the profile would refuse", async ({ request, baseURL }) => {
  const response = await request.post("/api/auth/sign-up/email", {
    headers: { origin: baseURL ?? "", "content-type": "application/json" },
    data: { name: "x".repeat(10_000), email: uniqueEmail(), password: "senha-segura-123" },
  });
  expect(response.status()).toBe(400);
});
