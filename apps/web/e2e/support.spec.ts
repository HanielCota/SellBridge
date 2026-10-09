import { expect, test } from "@playwright/test";
import { ADMIN_USER, gotoHydrated, signIn, signUp } from "./helpers";

const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

test("revendedor abre chamado com anexo e o admin responde e encerra", async ({ browser }) => {
  const resellerContext = await browser.newContext({ locale: "pt-BR" });
  const reseller = await resellerContext.newPage();
  await signUp(reseller, "Revendedor Suporte");
  const subject = `Pedido atrasado ${Date.now()}`;

  await gotoHydrated(reseller, "/suporte");
  await expect(reseller.getByText("Você ainda não abriu chamados")).toBeVisible();
  await reseller.getByRole("link", { name: "Abrir chamado" }).click();
  await reseller.waitForLoadState("networkidle");

  await reseller.getByRole("button", { name: "Abrir chamado" }).click();
  await expect(reseller.getByText("O assunto deve ter ao menos 5 caracteres")).toBeVisible();

  await reseller.getByLabel("Assunto").fill(subject);
  await reseller
    .getByLabel("Descrição")
    .fill("O pedido SIM-123 ainda não foi entregue ao comprador.");
  await reseller.getByLabel("Anexos (opcional)").setInputFiles({
    name: "comprovante.pdf",
    mimeType: "application/pdf",
    buffer: PDF_BYTES,
  });
  await expect(reseller.getByText("comprovante.pdf")).toBeVisible();
  await reseller.getByRole("button", { name: "Abrir chamado" }).click();

  await expect(reseller.getByRole("heading", { name: subject })).toBeVisible();
  await expect(reseller.getByText("Aguardando suporte")).toBeVisible();
  await expect(reseller.getByRole("link", { name: /comprovante\.pdf/ })).toBeVisible();

  const adminContext = await browser.newContext({ locale: "pt-BR" });
  const admin = await adminContext.newPage();
  await signIn(admin, ADMIN_USER);
  await gotoHydrated(admin, "/admin/chamados");
  await admin.getByLabel("Buscar chamados").fill(subject);
  // Waits for the debounced search navigation so it cannot undo the click below.
  await expect(admin).toHaveURL(/query=/);
  await admin.getByRole("link", { name: subject }).click();
  await expect(admin.getByText(/^Revendedor Suporte · e2e-/)).toBeVisible();
  await admin.waitForLoadState("networkidle");

  const download = admin.waitForEvent("download");
  await admin.getByRole("link", { name: /comprovante\.pdf/ }).click();
  expect((await download).suggestedFilename()).toBe("comprovante.pdf");

  await admin
    .getByLabel("Resposta do suporte")
    .fill("Verificamos com o fornecedor: o envio sai hoje.");
  await admin.getByRole("button", { name: "Enviar resposta" }).click();
  await expect(admin.getByText("Resposta enviada ao revendedor")).toBeVisible();
  await expect(admin.getByText("Respondido")).toBeVisible();
  await admin.getByRole("button", { name: "Encerrar chamado" }).click();
  await expect(admin.getByText("Chamado encerrado. Reabra para responder.")).toBeVisible();

  await reseller.reload({ waitUntil: "networkidle" });
  await expect(reseller.getByText("Verificamos com o fornecedor: o envio sai hoje.")).toBeVisible();
  await expect(reseller.getByText("Encerrado")).toBeVisible();

  await resellerContext.close();
  await adminContext.close();
});

test("recusa anexo com conteúdo diferente da extensão", async ({ page }) => {
  await signUp(page, "Revendedor Anexo Falso");
  await gotoHydrated(page, "/suporte/novo");
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
