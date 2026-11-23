import { expect, test } from "@playwright/test";
import { member, orders, organization, storeConnections, user } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { gotoHydrated, signUp } from "./helpers";
import { e2eDatabase } from "./database";

const database = e2eDatabase();
/** The password `signUp` creates accounts with. */
const PASSWORD = "senha-segura-123";

test.afterAll(async () => {
  await database.$client.end();
});

test("downloads a copy of the account's own data from the profile", async ({ page }) => {
  const email = await signUp(page, "Revendedora Exporta");
  await gotoHydrated(page, "/perfil");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Baixar arquivo" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^sellbridge-meus-dados-\d{4}-\d{2}-\d{2}\.json$/);
  const response = await page.request.get("/api/conta/exportar");
  const exported: unknown = await response.json();
  expect(exported).toMatchObject({ format: "sellbridge-account-export/1", user: { email } });
});

async function ownerOf(email: string) {
  const [owner] = await database
    .select({ userId: user.id, tenantId: member.organizationId })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(eq(user.email, email));
  if (owner === undefined) {
    throw new Error("Conta nova sem organização no banco de teste");
  }
  return owner;
}

test("keeps the account while an order is still to ship, and says what is left", async ({
  page,
}) => {
  const email = await signUp(page, "Revendedora Com Pedido");
  const owner = await ownerOf(email);
  const [store] = await database
    .insert(storeConnections)
    .values({
      tenantId: owner.tenantId,
      marketplace: "mock",
      externalShopId: `pendente-${owner.tenantId}`,
      shopName: "Loja com pedido",
      accessTokenEnc: "enc-access",
      refreshTokenEnc: "enc-refresh",
      expiresAt: new Date(Date.now() + 3_600_000),
    })
    .returning({ id: storeConnections.id });
  await database.insert(orders).values({
    tenantId: owner.tenantId,
    storeConnectionId: store?.id ?? "",
    externalOrderId: `PEND-${owner.tenantId}`,
    status: "paid",
    totalCents: 34_000,
    orderedAt: new Date(),
    paidAt: new Date(),
  });

  await gotoHydrated(page, "/perfil");

  await expect(
    page.getByText("Antes de excluir, resolva o que ainda está em andamento"),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "1 pedido para enviar" })).toHaveAttribute(
    "href",
    /^\/pedidos\?perfil=/,
  );
  await expect(page.getByRole("button", { name: "Excluir conta" })).toBeDisabled();
  // The server refuses on its own, whatever the screen shows.
  const refused = await page.request.post("/api/auth/delete-user", {
    data: { password: PASSWORD },
    // Better Auth refuses a cookie-authenticated POST without the page's origin, as a browser sends.
    headers: { origin: new URL(page.url()).origin },
  });
  expect(await refused.text()).toContain("Antes de excluir a conta, resolva: 1 pedido para enviar");
  expect(refused.status()).toBe(409);
  expect(await database.select().from(user).where(eq(user.id, owner.userId))).toHaveLength(1);
});

test("deletes the account and its workspace after the password", async ({ page }) => {
  const email = await signUp(page, "Revendedora Exclui");
  const owner = await ownerOf(email);

  await gotoHydrated(page, "/perfil");
  await page.getByRole("button", { name: "Excluir conta" }).click();
  const dialog = page.getByRole("dialog", { name: "Excluir sua conta?" });
  await expect(
    dialog.getByText("Sua assinatura é cancelada na hora, sem devolução."),
  ).toBeVisible();
  // The 7-day refund of the first fee goes through cancelling the plan, never through deleting.
  await expect(dialog.getByText("Pagou a primeira mensalidade há 7 dias ou menos?")).toBeVisible();
  await dialog.screenshot({ path: test.info().outputPath("delete-account-dialog.png") });
  await dialog.getByLabel("Sua senha").fill("senha-errada-000");
  await dialog.getByRole("button", { name: "Excluir conta" }).click();
  await expect(dialog.getByText("Senha incorreta")).toBeVisible();

  await dialog.getByLabel("Sua senha").fill(PASSWORD);
  await dialog.getByRole("button", { name: "Excluir conta" }).click();
  // Signed out on the sign-in, which says what just happened.
  await expect(page).toHaveURL(/\/login\?contaExcluida=true$/);
  await expect(page.getByText("Sua conta foi excluída.")).toBeVisible();
  expect(await database.select().from(user).where(eq(user.id, owner.userId))).toEqual([]);
  expect(
    await database.select().from(organization).where(eq(organization.id, owner.tenantId)),
  ).toEqual([]);
});
