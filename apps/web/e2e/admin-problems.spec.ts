import { type Browser, expect, test } from "@playwright/test";
import { member, problemEvents, user } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { ADMIN_USER, DEMO_USER, enableAdminMode, gotoHydrated, signIn, signUp } from "./helpers";
import { e2eDatabase } from "./database";

/* Admin "Problemas": errors the system logged, for the team to see and mark as resolved. */
const database = e2eDatabase();
const RUN = Date.now();
const MESSAGE = `O Mercado Livre recusou o título (teste ${RUN})`;
let problemId = "";

test.beforeAll(async () => {
  const [reseller] = await database
    .select({ tenantId: member.organizationId })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(user.email, DEMO_USER.email))
    .limit(1);
  const lastSeenAt = new Date(Date.now() - 5 * 60 * 1000);
  const [problem] = await database
    .insert(problemEvents)
    .values({
      service: "worker",
      area: "publishing",
      event: "listing.publish_failed",
      message: MESSAGE,
      fingerprint: `e2e-${RUN}`,
      tenantId: reseller?.tenantId ?? null,
      context: { reason: MESSAGE, isFinal: true, error: { name: "MarketplaceError" } },
      occurrences: 12,
      firstSeenAt: new Date(lastSeenAt.getTime() - 60 * 60 * 1000),
      lastSeenAt,
    })
    .returning({ id: problemEvents.id });
  problemId = problem?.id ?? "";
});

test.afterAll(async () => {
  await database.delete(problemEvents).where(eq(problemEvents.id, problemId));
  await database.$client.end();
});

test("o admin vê o problema registrado e marca como resolvido, com desfazer", async ({ page }) => {
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await page
    .getByRole("navigation", { name: "Administração" })
    .getByRole("link", { name: "Problemas" })
    .click();
  await expect(page.getByRole("heading", { name: "Problemas", level: 1 })).toBeVisible();

  const row = page.getByRole("row", { name: new RegExp(`teste ${RUN}`) });
  await expect(row).toContainText("Publicação");
  await expect(row).toContainText("12 vezes");
  await expect(row).toContainText("há 5 minutos");
  await row.getByRole("link", { name: MESSAGE }).click();

  await expect(page.getByRole("heading", { name: MESSAGE, level: 1 })).toBeVisible();
  await expect(page.getByText("listing.publish_failed").first()).toBeVisible();
  await page.getByRole("button", { name: "Marcar como resolvido" }).click();
  await expect(page.getByText(/^Resolvido em /)).toBeVisible();

  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByText("Em aberto", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Marcar como resolvido" })).toBeVisible();

  await page.getByRole("button", { name: "Marcar como resolvido" }).click();
  await expect(page.getByText(/^Resolvido em /)).toBeVisible();
  await gotoHydrated(page, "/admin/problemas?status=resolved");
  await expect(page.getByRole("row", { name: new RegExp(`teste ${RUN}`) })).toBeVisible();
});

/** A fresh account given a team role straight in the database. */
async function agentPage(browser: Browser) {
  const context = await browser.newContext({ locale: "pt-BR" });
  const page = await context.newPage();
  const email = await signUp(page, "Atendente Problemas");
  await database.update(user).set({ role: "agent" }).where(eq(user.email, email));
  return { context, page };
}

test("só o admin abre os problemas: atendente e revendedor ficam de fora", async ({ browser }) => {
  const agent = await agentPage(browser);
  await gotoHydrated(agent.page, "/dashboard");
  await enableAdminMode(agent.page);
  await agent.page.goto(`/admin/problemas/${problemId}`);
  await expect(agent.page).toHaveURL(/\/admin\/chamados/);
  const teamTabs = agent.page.getByRole("navigation", { name: "Administração" });
  await expect(teamTabs.getByRole("link", { name: /^Chamados/ })).toBeVisible();
  await expect(teamTabs.getByRole("link", { name: "Problemas" })).toHaveCount(0);
  await agent.context.close();

  const resellerContext = await browser.newContext({ locale: "pt-BR" });
  const reseller = await resellerContext.newPage();
  await signIn(reseller, DEMO_USER);
  await reseller.goto("/admin/problemas");
  await expect(reseller).toHaveURL(/\/dashboard/);
  await resellerContext.close();
});
