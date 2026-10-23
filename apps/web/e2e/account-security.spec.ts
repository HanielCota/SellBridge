import { expect, type Page, test } from "@playwright/test";
import { user } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { ADMIN_USER, signIn, signUp, uniqueEmail } from "./helpers";
import { e2eDatabase } from "./database";

const database = e2eDatabase();

test.afterAll(async () => {
  await database.$client.end();
});

async function getFromPage(page: Page, path: string) {
  return page.evaluate(async (routePath) => {
    const response = await fetch(`/api/auth${routePath}`);
    return response.status;
  }, path);
}

/** Calls a Better Auth route from the page, as a script on the site could. */
async function postFromPage(page: Page, path: string, body: Record<string, unknown>) {
  return page.evaluate(
    async ({ path: routePath, body: routeBody }) => {
      const response = await fetch(`/api/auth${routePath}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(routeBody),
      });
      return response.status;
    },
    { path, body },
  );
}

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

  // Inviting someone would add a member with access to the shop's orders and buyers.
  const invite = await page.request.post("/api/auth/organization/invite-member", {
    headers,
    data: { email: uniqueEmail(), role: "member" },
  });
  expect(invite.status()).toBe(404);

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

test("the admin plugin's routes are closed to the browser, even for an owner", async ({
  browser,
}) => {
  const resellerPage = await browser.newPage();
  const resellerEmail = await signUp(resellerPage, "Revendedora Protegida");
  await resellerPage.close();
  const [reseller] = await database
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, resellerEmail));
  if (!reseller) throw new Error("revendedora de teste não criada");

  const page = await browser.newPage();
  await signIn(page, ADMIN_USER);
  const newAccount = uniqueEmail("criada-pela-api");
  const attempts = {
    "/admin/set-user-password": { userId: reseller.id, newPassword: "senha-trocada-123" },
    "/admin/remove-user": { userId: reseller.id },
    "/admin/create-user": { email: newAccount, password: "senha-segura-123", name: "Criada" },
  };
  for (const [path, body] of Object.entries(attempts)) {
    expect.soft(await postFromPage(page, path, body), path).toBe(404);
  }
  expect.soft(await getFromPage(page, "/admin/list-users?limit=5"), "/admin/list-users").toBe(404);
  // Nothing changed: the account is still there and no account was created.
  const [still] = await database.select({ id: user.id }).from(user).where(eq(user.id, reseller.id));
  expect(still).toBeDefined();
  const created = await database
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, newAccount));
  expect(created).toEqual([]);
});
