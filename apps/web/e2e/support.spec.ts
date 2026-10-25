import { fileURLToPath } from "node:url";
import { expect, type Browser, type Locator, type Page, test } from "@playwright/test";
import {
  ADMIN_USER,
  enableAdminMode,
  gotoHydrated,
  signIn,
  signUp,
  signUpAsSupplier,
  waitForHydration,
} from "./helpers";

const AVATAR_FIXTURE = fileURLToPath(new URL("./fixtures/avatar.png", import.meta.url));

/** The image is on screen and its file actually loaded (a broken link keeps width 0). */
async function expectLoadedImage(image: Locator) {
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((element) => (element instanceof HTMLImageElement ? element.naturalWidth : 0)),
    )
    .toBeGreaterThan(0);
}

const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

/** The subject the server gives a late-order ticket: the situation, then the description. */
function lateOrderSubject(body: string): string {
  return `O pedido atrasou: ${body}`;
}

/** Picks "Pedido ou entrega" › "O pedido atrasou" and writes the description. */
async function describeLateOrder(page: Page, body: string) {
  await page.getByRole("button", { name: /^Pedido ou entrega/ }).click();
  await page.getByRole("button", { name: /^O pedido atrasou/ }).click();
  await page.getByLabel("O que aconteceu com a entrega?").fill(body);
}

async function openTicket(page: Page, body: string): Promise<string> {
  await gotoHydrated(page, "/suporte/novo");
  await describeLateOrder(page, body);
  await page.getByRole("button", { name: "Enviar chamado" }).click();
  await expect(page.getByRole("heading", { name: "O pedido atrasou", exact: true })).toBeVisible();
  return lateOrderSubject(body);
}

async function openAsStaff(page: Page, subject: string) {
  await gotoHydrated(page, "/admin/chamados");
  await page.getByLabel("Buscar chamados").fill(subject);
  // Waits for the debounced search navigation so it cannot undo the click below.
  await expect(page).toHaveURL(/query=/);
  await page.getByRole("link", { name: subject }).click();
  // The team reads the topic as the title too; the customer's words stay in the thread.
  await expect(page.getByRole("heading", { name: "O pedido atrasou", exact: true })).toBeVisible();
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
  const body = `O pedido SIM-${Date.now()} ainda não foi entregue.`;
  const subject = lateOrderSubject(body);

  await gotoHydrated(reseller, "/suporte");
  await expect(reseller.getByText("Você ainda não abriu chamados")).toBeVisible();
  await reseller.getByRole("link", { name: "Abrir chamado" }).click();
  await reseller.waitForLoadState("networkidle");

  await describeLateOrder(reseller, "Atrasou");
  await reseller.getByRole("button", { name: "Enviar chamado" }).click();
  await expect(
    reseller.getByText("Conte um pouco mais para a equipe entender o caso."),
  ).toBeVisible();

  await reseller.getByLabel("O que aconteceu com a entrega?").fill(body);
  await reseller.locator('input[type="file"]').setInputFiles({
    name: "comprovante.pdf",
    mimeType: "application/pdf",
    buffer: PDF_BYTES,
  });
  await expect(
    reseller.getByRole("list", { name: "Arquivos escolhidos" }).getByText("comprovante.pdf"),
  ).toBeVisible();
  await reseller.getByRole("button", { name: "Enviar chamado" }).click();

  // The customer reads the topic as the title; their own words stay in the message below.
  await expect(
    reseller.getByRole("heading", { name: "O pedido atrasou", exact: true }),
  ).toBeVisible();
  await expect(reseller.getByText("Esperando o suporte.")).toBeVisible();
  // The support hours, the same line on every customer screen.
  await expect(
    reseller.getByText(/Atendimento todos os dias, das 8h às 18h \(horário de Brasília\)/),
  ).toBeVisible();
  await expect(reseller.getByRole("link", { name: /comprovante\.pdf/ })).toBeVisible();
  // Without a photo the reseller's own message shows their initials, like the top bar does.
  const resellerMessages = reseller.getByRole("list", { name: "Mensagens do chamado" });
  await expect(resellerMessages.getByText("RS", { exact: true })).toBeVisible();

  const { context: adminContext, page: admin } = await adminPage(browser);
  await openAsStaff(admin, subject);
  await expect(admin.getByLabel("Contexto do cliente").getByText(/^e2e-/)).toBeVisible();
  await expect(admin.getByLabel("Atendimento").getByText(/^Vence em/)).toBeVisible();
  const adminMessages = admin.getByRole("list", { name: "Mensagens do chamado" });
  await expect(adminMessages.getByText(body)).toBeVisible();
  await expect(adminMessages.getByText("RS", { exact: true })).toBeVisible();

  const download = admin.waitForEvent("download");
  await admin.getByRole("link", { name: /comprovante\.pdf/ }).click();
  expect((await download).suggestedFilename()).toBe("comprovante.pdf");

  await admin.getByRole("button", { name: "Nota interna" }).click();
  await expect(admin.getByText("Só a equipe vê.")).toBeVisible();
  // Ready answers are written to the customer: a note never offers them.
  await expect(admin.getByRole("button", { name: "Respostas prontas" })).toHaveCount(0);
  await admin.getByLabel("Nota para a equipe").fill("Fornecedor confirmou atraso na coleta.");
  await admin.getByRole("button", { name: "Salvar nota" }).click();
  await expect(admin.getByText("Nota interna salva")).toBeVisible();
  const adminHeader = admin
    .getByRole("heading", { name: "O pedido atrasou", exact: true })
    .locator("..");
  await expect(adminHeader.getByText("Aguardando suporte", { exact: true })).toBeVisible();

  await admin.getByRole("button", { name: "Responder ao cliente" }).click();
  await expect(admin.getByText("O cliente vê esta mensagem.")).toBeVisible();
  await admin
    .getByLabel("Resposta do suporte")
    .fill("Verificamos com o fornecedor: o envio sai hoje.");
  await admin.getByRole("button", { name: "Enviar ao cliente", exact: true }).click();
  await expect(
    admin.getByText(/Resposta enviada\. Sem retorno do cliente em 7 dias/),
  ).toBeVisible();
  await expect(adminHeader.getByText("Respondido", { exact: true })).toBeVisible();
  // Answering a ticket nobody had makes it yours, and the history says so.
  await expect(admin.getByLabel("Histórico").getByText(/assumiu o chamado/)).toBeVisible();
  await admin.getByRole("button", { name: "Opções de envio" }).click();
  await admin.getByRole("menuitem", { name: "Encerrar sem responder" }).click();
  await expect(admin.getByText("Chamado encerrado. Reabra para responder.")).toBeVisible();
  // Quoting on a closed ticket opens a note with the quote, instead of a hidden reply box.
  await admin.getByRole("button", { name: /^Citar mensagem de Revendedor Suporte/ }).click();
  await expect(admin.getByLabel("Nota para a equipe")).toHaveValue(/Revendedor Suporte escreveu/);

  await reseller.reload({ waitUntil: "networkidle" });
  await expect(reseller.getByText("Verificamos com o fornecedor: o envio sai hoje.")).toBeVisible();
  await expect(reseller.getByText("Fornecedor confirmou atraso na coleta.")).toBeHidden();
  await expect(reseller.getByText("Encerrado.", { exact: true })).toBeVisible();
  await expect(reseller.getByText(/Escreva abaixo e o chamado reabre/)).toBeVisible();
  await reseller.getByLabel("Sua resposta").fill("Ainda não chegou, podem verificar de novo?");
  await reseller.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(reseller.getByText("Mensagem enviada")).toBeVisible();
  await expect(reseller.getByText("Esperando o suporte.")).toBeVisible();

  await resellerContext.close();
  await adminContext.close();
});

test("botão de suporte avisa a resposta nova, e o revendedor encerra e avalia", async ({
  browser,
}) => {
  const resellerContext = await browser.newContext({ locale: "pt-BR" });
  const reseller = await resellerContext.newPage();
  await signUp(reseller, "Revendedor Avaliação");

  await gotoHydrated(reseller, "/dashboard");
  await reseller.getByRole("button", { name: "Suporte", exact: true }).click();
  // The corner bubble is a second "Abrir chamado"; this one sits in the Suporte panel.
  await reseller.getByRole("dialog").getByRole("link", { name: "Abrir chamado" }).click();
  await expect(reseller).toHaveURL(/\/suporte\/novo/);
  await waitForHydration(reseller);
  const subject = await openTicket(reseller, `Quando cai o repasse da semana ${Date.now()}`);

  const { context: adminContext, page: admin } = await adminPage(browser);
  await openAsStaff(admin, subject);
  await admin.getByLabel("Resposta do suporte").fill("O repasse cai toda sexta-feira.");
  await admin.getByRole("button", { name: "Enviar ao cliente", exact: true }).click();
  await expect(
    admin.getByText(/Resposta enviada\. Sem retorno do cliente em 7 dias/),
  ).toBeVisible();

  await gotoHydrated(reseller, "/dashboard");
  const supportButton = reseller.getByRole("button", {
    name: "Suporte: 1 chamado com resposta nova",
    exact: true,
  });
  await expect(supportButton).toBeVisible();
  // One reply, one number: the bell lists it without counting it, the corner bubble shows none.
  await expect(reseller.getByRole("button", { name: "Avisos", exact: true })).toBeVisible();
  await expect(
    reseller.getByRole("link", { name: "Falar com o suporte", exact: true }),
  ).toBeVisible();
  await supportButton.click();
  await reseller.getByRole("link", { name: new RegExp(subject) }).click();
  await expect(reseller.getByText("O repasse cai toda sexta-feira.")).toBeVisible();
  // Reading the reply clears the count on the button.
  await expect(reseller.getByRole("button", { name: "Suporte", exact: true })).toBeVisible();

  await expect(reseller.getByText("O suporte respondeu.")).toBeVisible();
  await reseller.getByRole("button", { name: "Sim, resolveu" }).click();
  // Closes once the undo window is over.
  await expect(reseller.getByText("Como foi o atendimento?")).toBeVisible({ timeout: 15_000 });
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

test("“Não” avisa o suporte na hora e “Desfazer” mantém o chamado aberto", async ({ browser }) => {
  const resellerContext = await browser.newContext({ locale: "pt-BR" });
  const reseller = await resellerContext.newPage();
  await signUp(reseller, "Revendedor Veredito");
  const subject = await openTicket(reseller, `A entrega parou no caminho ${Date.now()}`);
  const ticketUrl = reseller.url();

  const { context: adminContext, page: admin } = await adminPage(browser);
  await openAsStaff(admin, subject);
  await admin
    .getByLabel("Resposta do suporte")
    .fill("O pedido sai hoje do centro de distribuição.");
  await admin.getByRole("button", { name: "Enviar ao cliente", exact: true }).click();
  await expect(
    admin.getByText(/Resposta enviada\. Sem retorno do cliente em 7 dias/),
  ).toBeVisible();

  await gotoHydrated(reseller, ticketUrl);
  await expect(reseller.getByText("O suporte respondeu.")).toBeVisible();
  await expect(reseller.getByText(/Sem resposta até \d{2}\/\d{2}, encerramos/)).toBeVisible();

  // A wrong tap on "Sim, resolveu" can be undone before anything changes.
  await reseller.getByRole("button", { name: "Sim, resolveu" }).click();
  await reseller.getByRole("button", { name: "Desfazer" }).click();
  await reseller.waitForTimeout(6000);
  await reseller.reload({ waitUntil: "networkidle" });
  await expect(reseller.getByText("O suporte respondeu.")).toBeVisible();

  // "Não" reaches support at once: the ticket goes back to the queue, no typing required.
  await reseller.getByRole("button", { name: "Não", exact: true }).click();
  await expect(reseller.getByText("Avisamos o suporte que ainda não resolveu")).toBeVisible();
  const messages = reseller.getByRole("list", { name: "Mensagens do chamado" });
  await expect(messages.getByText("Ainda não resolveu.")).toBeVisible();
  await expect(reseller.getByText("Esperando o suporte.")).toBeVisible();
  await expect(
    reseller.getByPlaceholder("Conte o que ainda falta resolver (opcional)…"),
  ).toBeFocused();

  await admin.reload({ waitUntil: "networkidle" });
  const adminHeader = admin
    .getByRole("heading", { name: "O pedido atrasou", exact: true })
    .locator("..");
  await expect(adminHeader.getByText("Aguardando suporte", { exact: true })).toBeVisible();
  await expect(admin.getByText("O cliente disse que a resposta não resolveu.")).toBeVisible();

  await resellerContext.close();
  await adminContext.close();
});

test("a foto de perfil do cliente aparece para ele e para o suporte no chamado", async ({
  browser,
}) => {
  const resellerContext = await browser.newContext({ locale: "pt-BR" });
  const reseller = await resellerContext.newPage();
  await signUp(reseller, "Cliente Com Foto");
  await gotoHydrated(reseller, "/perfil");
  await reseller.getByLabel("Escolher foto de perfil").setInputFiles(AVATAR_FIXTURE);
  await expect(reseller.getByText("Foto de perfil atualizada")).toBeVisible();
  const subject = await openTicket(reseller, `Pedido parado na transportadora ${Date.now()}`);
  const resellerMessages = reseller.getByRole("list", { name: "Mensagens do chamado" });
  await expectLoadedImage(resellerMessages.locator("img[src^='/api/perfil/foto/']").first());

  const { context: adminContext, page: admin } = await adminPage(browser);
  await openAsStaff(admin, subject);
  const adminMessages = admin.getByRole("list", { name: "Mensagens do chamado" });
  await expectLoadedImage(adminMessages.locator("img[src^='/api/perfil/foto/']").first());
  // The customer card beside the thread shows the same photo, not only the initials.
  const customerCard = admin.getByLabel("Contexto do cliente");
  await expectLoadedImage(customerCard.locator("img[src^='/api/perfil/foto/']"));

  await resellerContext.close();
  await adminContext.close();
});

test("fornecedor abre chamado sem seletor de pedido e o suporte sabe que é fornecedor", async ({
  browser,
}) => {
  const supplierContext = await browser.newContext({ locale: "pt-BR" });
  const supplier = await supplierContext.newPage();
  await signUpAsSupplier(supplier, "Fornecedor Suporte");
  await gotoHydrated(supplier, "/suporte/novo");
  await supplier.getByRole("button", { name: /^Pedido encaminhado/ }).click();
  await supplier.getByRole("button", { name: /^Endereço incompleto/ }).click();
  const body = `O pedido veio sem número da casa ${Date.now()}, não consigo despachar.`;
  await supplier.getByRole("textbox").first().fill(body);
  await supplier.getByRole("button", { name: "Enviar chamado" }).click();
  await expect(supplier.getByText("Esperando o suporte.")).toBeVisible();
  // A supplier has no store orders: the picker only ever opened empty.
  await expect(supplier.getByRole("button", { name: "Escolher pedido" })).toHaveCount(0);
  await expect(supplier.getByRole("button", { name: "Vincular um pedido ao chamado" })).toHaveCount(
    0,
  );
  await gotoHydrated(supplier, "/suporte");
  await expect(
    supplier.getByText("Pedido encaminhado", { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();

  const { context: adminContext, page: admin } = await adminPage(browser);
  await gotoHydrated(admin, "/admin/chamados");
  await admin.getByLabel("Buscar chamados").fill(body);
  await expect(admin).toHaveURL(/query=/);
  const row = admin.getByRole("row").filter({ hasText: "Fornecedor Suporte" });
  // Earlier runs left tickets of the same name: wait for the search to narrow to this one.
  await expect(row).toHaveCount(1);
  await expect(row.getByText(/^Fornecedor · /)).toBeVisible();
  await row.getByRole("link").first().click();
  const header = admin.getByRole("heading", { level: 1 }).locator("../..");
  await expect(header.getByText(/· Fornecedor ·/)).toBeVisible();
  await expect(header.getByText("Pedido encaminhado", { exact: true })).toBeVisible();
  // The topic picker beside the thread uses the supplier's words too.
  await expect(admin.getByRole("combobox", { name: "Tema do chamado" })).toHaveText(
    "Pedido encaminhado",
  );
  await admin.getByRole("button", { name: "Respostas prontas" }).click();
  await expect(admin.getByRole("menuitem", { name: /^Saudação/ })).toBeVisible();
  await expect(admin.getByRole("menuitem", { name: /^Encaminhado ao fornecedor/ })).toHaveCount(0);

  await supplierContext.close();
  await adminContext.close();
});

test("no celular o suporte chega na fila de atrasados pelo seletor", async ({ browser }) => {
  const { context, page: admin } = await adminPage(browser);
  await admin.setViewportSize({ width: 390, height: 844 });
  await gotoHydrated(admin, "/admin/chamados");
  await admin.getByRole("combobox", { name: "Fila de chamados" }).click();
  await admin.getByRole("option", { name: /^Atrasados/ }).click();
  await expect(admin).toHaveURL(/queue=overdue/);
  await context.close();
});

test("atendente vê só o suporte e assume um chamado da fila", async ({ browser }) => {
  const agentContext = await browser.newContext({ locale: "pt-BR" });
  const agent = await agentContext.newPage();
  const agentEmail = await signUp(agent, "Atendente Novo");

  const resellerContext = await browser.newContext({ locale: "pt-BR" });
  const reseller = await resellerContext.newPage();
  await signUp(reseller, "Revendedor Fila");
  const subject = await openTicket(reseller, `Loja desconectada desde ontem ${Date.now()}`);

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
  // MVP item 3: an agent enters a customer with an open ticket; the customer file stays admin-only.
  await expect(agent.getByRole("button", { name: "Entrar como cliente" })).toBeVisible();
  await expect(agent.getByRole("link", { name: "Ver ficha do cliente" })).toHaveCount(0);
  await agent.getByRole("button", { name: "Assumir chamado" }).click();
  await expect(agent.getByText("Responsável atualizado")).toBeVisible();
  await expect(agent.getByLabel("Atendimento").getByText("Você", { exact: true })).toBeVisible();

  await gotoHydrated(agent, "/admin/chamados?queue=mine");
  await expect(agent.getByRole("link", { name: subject })).toBeVisible();

  // Metrics are for supervisors and admins: no "Fila · Desempenho" switch, and no way in by URL.
  await expect(agent.getByRole("group", { name: "Área do suporte" })).toHaveCount(0);
  await agent.goto("/admin/chamados/metricas");
  await expect(agent).toHaveURL(/\/admin\/chamados(\?|$)/);

  await agentContext.close();
  await resellerContext.close();
  await adminContext.close();
});

test("recusa anexo com conteúdo diferente da extensão", async ({ page }) => {
  await signUp(page, "Revendedor Anexo Falso");
  await gotoHydrated(page, "/suporte/novo");
  await describeLateOrder(page, "Este arquivo não é realmente uma imagem PNG.");
  await page.locator('input[type="file"]').setInputFiles({
    name: "foto.png",
    mimeType: "image/png",
    buffer: Buffer.from("MZ executável disfarçado"),
  });
  await page.getByRole("button", { name: "Enviar chamado" }).click();
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
