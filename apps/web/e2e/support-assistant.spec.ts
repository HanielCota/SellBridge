import { expect, test, type Route } from "@playwright/test";
import { ADMIN_USER, enableAdminMode, gotoHydrated, signIn, signUp } from "./helpers";

test("the assistant answers a plan question and “Resolveu” opens no ticket", async ({ page }) => {
  await signUp(page, "Revendedor Assistente");
  await gotoHydrated(page, "/suporte/novo");
  await page.getByRole("button", { name: /^Minha conta/ }).click();
  await page.getByRole("button", { name: /^Plano e mensalidade/ }).click();
  await page.getByLabel("Qual a sua dúvida sobre o plano?").fill("Quero trocar o cartão do plano.");
  await page.getByRole("button", { name: "Enviar chamado" }).click();

  const answer = page.getByRole("region", { name: "Como mudar o plano ou o cartão" });
  await expect(answer).toContainText("resposta automática");
  await expect(answer.getByRole("link", { name: /Abrir Planos e assinatura/ })).toHaveAttribute(
    "href",
    /\/assinatura/,
  );
  await page.getByRole("button", { name: "Resolveu meu problema" }).click();

  await expect(page).toHaveURL(/\/suporte(\?|$)/);
  await expect(page.getByText("Você ainda não abriu chamados")).toBeVisible();
});

test("an answer that arrives after the text changed is not shown", async ({ page }) => {
  await signUp(page, "Revendedor Resposta Antiga");
  await gotoHydrated(page, "/suporte/novo");
  await page.getByRole("button", { name: /^Minha conta/ }).click();
  await page.getByRole("button", { name: /^Plano e mensalidade/ }).click();
  const field = page.getByLabel("Qual a sua dúvida sobre o plano?");
  await field.fill("Quero trocar o cartão do plano.");

  // Holds the assistant's reply until the customer has edited the text.
  const heldReplies: Route[] = [];
  await page.route("**/_serverFn/**", async (route) => {
    if (route.request().method() === "POST") {
      heldReplies.push(route);
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Enviar chamado" }).click();
  await expect(page.getByRole("button", { name: "Um momento…" })).toBeVisible();
  await field.fill("Quero trocar o cartão do plano e também o e-mail da conta.");

  const staleReply = page.waitForResponse(
    (response) => response.url().includes("/_serverFn/") && response.request().method() === "POST",
  );
  await Promise.all(heldReplies.map((route) => route.continue()));
  await staleReply;
  await page.unroute("**/_serverFn/**");
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );

  await expect(page.getByRole("region", { name: "Como mudar o plano ou o cartão" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Enviar chamado" })).toBeVisible();
  await expect(field).toHaveValue(/também o e-mail/);
});

test("“Ainda preciso de ajuda” sends the ticket and the team sees the answer", async ({
  browser,
}) => {
  const resellerContext = await browser.newContext({ locale: "pt-BR" });
  const reseller = await resellerContext.newPage();
  await signUp(reseller, "Revendedor Anuncio Parado");
  await gotoHydrated(reseller, "/suporte/novo");
  await reseller.getByRole("button", { name: /^Meus anúncios/ }).click();
  await reseller.getByRole("button", { name: /^Anúncio recusado ou parado/ }).click();
  const body = `O anúncio do tênis ${Date.now()} foi pausado sem aviso.`;
  await reseller.getByLabel("Qual anúncio e qual motivo apareceu?").fill(body);
  await reseller.getByRole("button", { name: "Enviar chamado" }).click();
  await expect(
    reseller.getByRole("region", { name: "Por que um anúncio fica pausado" }),
  ).toBeVisible();

  await reseller.getByRole("button", { name: "Ainda preciso de ajuda" }).click();
  await expect(
    reseller.getByRole("heading", { name: "Anúncio recusado ou parado", exact: true }),
  ).toBeVisible();
  // The customer already read the answer: the thread holds only their own message.
  const thread = reseller.getByRole("list", { name: "Mensagens do chamado" });
  await expect(thread.getByRole("article")).toHaveCount(1);
  await expect(thread.getByText("Por que um anúncio fica pausado")).toHaveCount(0);

  const adminContext = await browser.newContext({ locale: "pt-BR" });
  const admin = await adminContext.newPage();
  await signIn(admin, ADMIN_USER);
  await enableAdminMode(admin);
  await gotoHydrated(admin, "/admin/chamados");
  const subject = `Anúncio recusado ou parado: ${body}`;
  await admin.getByLabel("Buscar chamados").fill(subject);
  await expect(admin).toHaveURL(/query=/);
  await admin.getByRole("link", { name: subject }).click();
  const note = admin.getByRole("region", { name: "Resposta automática" });
  await expect(note).toContainText("Por que um anúncio fica pausado");
  await expect(note).toContainText("1. Abra Publicações");
  await expect(
    admin.getByRole("list", { name: "Mensagens do chamado" }).getByText(body),
  ).toBeVisible();

  await resellerContext.close();
  await adminContext.close();
});

test("an order problem skips the assistant and goes straight to the team", async ({ page }) => {
  await signUp(page, "Revendedor Pedido Direto");
  await gotoHydrated(page, "/suporte/novo");
  await page.getByRole("button", { name: /^Pedido ou entrega/ }).click();
  await page.getByRole("button", { name: /^Cancelar ou devolver/ }).click();
  await page
    .getByLabel("O que travou no cancelamento ou na devolução?")
    .fill("Esqueci a senha e o comprador quer devolver o pedido.");
  await page.getByRole("button", { name: "Enviar chamado" }).click();
  await expect(
    page.getByRole("heading", { name: "Cancelar ou devolver", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("resposta automática")).toHaveCount(0);
});
