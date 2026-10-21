import { expect, type Browser, type Page, test } from "@playwright/test";
import {
  ADMIN_USER,
  enableAdminMode,
  gotoHydrated,
  signIn,
  signUp,
  waitForHydration,
} from "./helpers";

const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

async function openTicket(page: Page, subject: string, body: string) {
  await gotoHydrated(page, "/suporte/novo");
  await page.getByText("Pedido ou entrega").click();
  await page.getByLabel("Assunto").fill(subject);
  await page.getByLabel("Descrição").fill(body);
  await page.getByRole("button", { name: "Abrir chamado" }).click();
  await expect(page.getByRole("heading", { name: subject })).toBeVisible();
}

async function openAsStaff(page: Page, subject: string) {
  await gotoHydrated(page, "/admin/chamados");
  await page.getByLabel("Buscar chamados").fill(subject);
  // Waits for the debounced search navigation so it cannot undo the click below.
  await expect(page).toHaveURL(/query=/);
  await page.getByRole("link", { name: subject }).click();
  await expect(page.getByRole("heading", { name: subject })).toBeVisible();
  await page.waitForLoadState("networkidle");
}

async function adminPage(browser: Browser) {
  const context = await browser.newContext({ locale: "pt-BR" });
  const page = await context.newPage();
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  return { context, page };
}

test("revendedor abre chamado com anexo e o admin responde e encerra", async ({ browser }) => {
  const resellerContext = await browser.newContext({ locale: "pt-BR" });
  const reseller = await resellerContext.newPage();
  await signUp(reseller, "Revendedor Suporte");
  const subject = `Pedido atrasado ${Date.now()}`;

  await gotoHydrated(reseller, "/suporte");
  await expect(reseller.getByText("Você ainda não abriu chamados")).toBeVisible();
  await reseller.getByRole("link", { name: "Abrir chamado" }).click();
  await reseller.waitForLoadState("networkidle");

  await reseller.getByLabel("Assunto").fill(subject);
  await reseller
    .getByLabel("Descrição")
    .fill("O pedido SIM-123 ainda não foi entregue ao comprador.");
  await reseller.getByRole("button", { name: "Abrir chamado" }).click();
  await expect(reseller.getByText("Escolha sobre o que é o chamado")).toBeVisible();

  await reseller.getByText("Pedido ou entrega").click();
  await reseller.getByLabel("Anexos (opcional)").setInputFiles({
    name: "comprovante.pdf",
    mimeType: "application/pdf",
    buffer: PDF_BYTES,
  });
  await expect(reseller.getByText("comprovante.pdf")).toBeVisible();
  await reseller.getByRole("button", { name: "Abrir chamado" }).click();

  await expect(reseller.getByRole("heading", { name: subject })).toBeVisible();
  const resellerHeader = reseller.getByRole("heading", { name: subject }).locator("..");
  await expect(resellerHeader.getByText("Aguardando suporte")).toBeVisible();
  await expect(reseller.getByText(/Resposta prevista até/)).toBeVisible();
  await expect(reseller.getByRole("link", { name: /comprovante\.pdf/ })).toBeVisible();
  // Without a photo the reseller's own message shows their initials, like the top bar does.
  const resellerMessages = reseller.getByRole("list", { name: "Mensagens do chamado" });
  await expect(resellerMessages.getByText("RS", { exact: true })).toBeVisible();

  const { context: adminContext, page: admin } = await adminPage(browser);
  await openAsStaff(admin, subject);
  await expect(admin.getByLabel("Contexto do cliente").getByText(/^e2e-/)).toBeVisible();
  await expect(admin.getByLabel("Atendimento").getByText(/^Vence em/)).toBeVisible();
  const adminMessages = admin.getByRole("list", { name: "Mensagens do chamado" });
  await expect(adminMessages.getByText("O pedido SIM-123 ainda não foi entregue")).toBeVisible();
  await expect(adminMessages.getByText("RS", { exact: true })).toBeVisible();

  const download = admin.waitForEvent("download");
  await admin.getByRole("link", { name: /comprovante\.pdf/ }).click();
  expect((await download).suggestedFilename()).toBe("comprovante.pdf");

  await admin.getByRole("button", { name: "Nota interna" }).click();
  await admin.getByLabel("Nota para a equipe").fill("Fornecedor confirmou atraso na coleta.");
  await admin.getByRole("button", { name: "Salvar nota" }).click();
  await expect(admin.getByText("Nota interna salva")).toBeVisible();
  const adminHeader = admin.getByRole("heading", { name: subject }).locator("..");
  await expect(adminHeader.getByText("Aguardando suporte", { exact: true })).toBeVisible();

  await admin.getByRole("button", { name: "Voltar a responder o cliente" }).click();
  await admin
    .getByLabel("Resposta do suporte")
    .fill("Verificamos com o fornecedor: o envio sai hoje.");
  await admin.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(admin.getByText("Resposta enviada ao revendedor")).toBeVisible();
  await expect(adminHeader.getByText("Respondido", { exact: true })).toBeVisible();
  // Answering a ticket nobody had makes it yours, and the history says so.
  await expect(admin.getByLabel("Histórico").getByText(/assumiu o chamado/)).toBeVisible();
  await admin.getByRole("button", { name: "Opções de envio" }).click();
  await admin.getByRole("menuitem", { name: "Encerrar sem responder" }).click();
  await expect(admin.getByText("Chamado encerrado. Reabra para responder.")).toBeVisible();

  await reseller.reload({ waitUntil: "networkidle" });
  await expect(reseller.getByText("Verificamos com o fornecedor: o envio sai hoje.")).toBeVisible();
  await expect(reseller.getByText("Fornecedor confirmou atraso na coleta.")).toBeHidden();
  await expect(resellerHeader.getByText("Encerrado", { exact: true })).toBeVisible();
  await expect(reseller.getByText("Responder reabre o chamado")).toBeVisible();
  await reseller.getByLabel("Sua resposta").fill("Ainda não chegou, podem verificar de novo?");
  await reseller.getByRole("button", { name: "Enviar resposta" }).click();
  await expect(reseller.getByText("Resposta enviada")).toBeVisible();
  await expect(resellerHeader.getByText("Aguardando suporte")).toBeVisible();

  await resellerContext.close();
  await adminContext.close();
});

test("botão de suporte avisa a resposta nova, e o revendedor encerra e avalia", async ({
  browser,
}) => {
  const resellerContext = await browser.newContext({ locale: "pt-BR" });
  const reseller = await resellerContext.newPage();
  await signUp(reseller, "Revendedor Avaliação");
  const subject = `Repasse do mês ${Date.now()}`;

  await gotoHydrated(reseller, "/dashboard");
  await reseller.getByRole("button", { name: "Suporte", exact: true }).click();
  await reseller.getByRole("link", { name: "Abrir chamado" }).click();
  await expect(reseller).toHaveURL(/\/suporte\/novo/);
  await waitForHydration(reseller);
  await openTicket(reseller, subject, "Quando cai o repasse das vendas desta semana?");

  const { context: adminContext, page: admin } = await adminPage(browser);
  await openAsStaff(admin, subject);
  await admin.getByLabel("Resposta do suporte").fill("O repasse cai toda sexta-feira.");
  await admin.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(admin.getByText("Resposta enviada ao revendedor")).toBeVisible();

  await gotoHydrated(reseller, "/dashboard");
  const supportButton = reseller.getByRole("button", {
    name: "Suporte: 1 chamado com resposta nova",
    exact: true,
  });
  await expect(supportButton).toBeVisible();
  await supportButton.click();
  await reseller.getByRole("link", { name: new RegExp(subject) }).click();
  await expect(reseller.getByText("O repasse cai toda sexta-feira.")).toBeVisible();
  // Reading the reply clears the count on the button.
  await expect(reseller.getByRole("button", { name: "Suporte", exact: true })).toBeVisible();

  await reseller.getByRole("button", { name: "Encerrar chamado" }).click();
  await expect(reseller.getByText("Como foi o atendimento?")).toBeVisible();
  // The radio is visually hidden behind its star, so it is checked without the visibility wait.
  await reseller.getByRole("radio", { name: "5 estrelas: Excelente" }).check({ force: true });
  await reseller.getByLabel("Comentário (opcional)").fill("Resposta rápida.");
  await reseller.getByRole("button", { name: "Enviar avaliação" }).click();
  await expect(reseller.getByText("Você avaliou este atendimento:")).toBeVisible();

  await admin.reload({ waitUntil: "networkidle" });
  await expect(admin.getByLabel("Atendimento").getByText("“Resposta rápida.”")).toBeVisible();

  await resellerContext.close();
  await adminContext.close();
});

test("atendente vê só o suporte e assume um chamado da fila", async ({ browser }) => {
  const agentContext = await browser.newContext({ locale: "pt-BR" });
  const agent = await agentContext.newPage();
  const agentEmail = await signUp(agent, "Atendente Novo");

  const resellerContext = await browser.newContext({ locale: "pt-BR" });
  const reseller = await resellerContext.newPage();
  await signUp(reseller, "Revendedor Fila");
  const subject = `Loja desconectou ${Date.now()}`;
  await openTicket(reseller, subject, "Minha loja aparece como desconectada desde ontem.");

  const { context: adminContext, page: admin } = await adminPage(browser);
  await gotoHydrated(admin, `/admin/clientes?query=${encodeURIComponent(agentEmail)}`);
  await admin.getByRole("button", { name: /^Atendente Novo/ }).click();
  await admin
    .getByRole("region", { name: "Resumo de Atendente Novo" })
    .getByRole("link", { name: "Ficha completa" })
    .click();
  await admin.getByRole("combobox", { name: "Papel do cliente" }).click();
  await admin.getByRole("option", { name: "Atendente" }).click();
  await expect(admin.getByText("Papel atualizado")).toBeVisible();

  // The role is read on every request, so the agent's open session picks it up on reload.
  await gotoHydrated(agent, "/dashboard");
  await enableAdminMode(agent);
  await expect(agent.getByRole("link", { name: "Clientes" })).toHaveCount(0);
  await agent.goto("/admin/clientes");
  await expect(agent).toHaveURL(/\/admin\/chamados/);

  await openAsStaff(agent, subject);
  // Agents can impersonate nobody: the account shortcuts are not there.
  await expect(agent.getByRole("button", { name: "Entrar como cliente" })).toHaveCount(0);
  await agent.getByRole("button", { name: "Assumir chamado" }).click();
  await expect(agent.getByText("Responsável atualizado")).toBeVisible();
  await expect(agent.getByLabel("Atendimento").getByText("Você", { exact: true })).toBeVisible();

  await gotoHydrated(agent, "/admin/chamados?queue=mine");
  await expect(agent.getByRole("link", { name: subject })).toBeVisible();

  // Metrics are for supervisors and admins.
  await agent.goto("/admin/chamados/metricas");
  await expect(agent).toHaveURL(/\/admin\/chamados(\?|$)/);

  await agentContext.close();
  await resellerContext.close();
  await adminContext.close();
});

test("recusa anexo com conteúdo diferente da extensão", async ({ page }) => {
  await signUp(page, "Revendedor Anexo Falso");
  await gotoHydrated(page, "/suporte/novo");
  await page.getByText("Conexão de loja").click();
  await page.getByLabel("Assunto").fill("Teste de anexo inválido");
  await page.getByLabel("Descrição").fill("Este arquivo não é realmente uma imagem PNG.");
  await page.getByLabel("Anexos (opcional)").setInputFiles({
    name: "foto.png",
    mimeType: "image/png",
    buffer: Buffer.from("MZ executável disfarçado"),
  });
  await page.getByRole("button", { name: "Abrir chamado" }).click();
  await expect(
    page.getByText('"foto.png" não é um formato aceito (PNG, JPG, WEBP ou PDF)'),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/suporte\/novo/);
});

test("revendedor não acessa a área de administração", async ({ page }) => {
  await signUp(page, "Revendedor Curioso");
  await page.goto("/admin/chamados");
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("link", { name: "Chamados" })).toHaveCount(0);
});

test("anexos de outro tenant não podem ser baixados", async ({ request }) => {
  const response = await request.get("/api/suporte/anexos/00000000-0000-4000-8000-000000000000");
  expect(response.status()).toBe(401);
});
