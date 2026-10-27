import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { member, suppliers, user } from "@sellbridge/database/schema";
import { SUPPLIER_TEXT_CONTACT_REFUSED } from "@sellbridge/shared/schemas";
import { eq } from "drizzle-orm";
import { gotoHydrated, signUpAsSupplier } from "./helpers";
import { e2eDatabase } from "./database";

/*
 * Every reseller reads a supplier's brand and products, so none of it may carry a phone, e-mail
 * or social network (the user's rule): on the form, on the server past the form, and per row in
 * a spreadsheet, whose other rows still import.
 */
const database = e2eDatabase();
/** Set to save the screenshots for the report. */
const evidenceDirectory = process.env.EVIDENCE_DIR;
const emails: string[] = [];

async function shot(page: Page, name: string) {
  if (evidenceDirectory === undefined) {
    return;
  }
  const width = page.viewportSize()?.width ?? 0;
  await page.screenshot({
    path: path.join(evidenceDirectory, `textos-fornecedor-${name}-${width}.png`),
    fullPage: true,
  });
}

async function brandNameOf(email: string): Promise<string | null> {
  const [row] = await database
    .select({ name: suppliers.name })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .innerJoin(suppliers, eq(suppliers.organizationId, member.organizationId))
    .where(eq(user.email, email));
  return row?.name ?? null;
}

async function registerBrand(page: Page, name: string) {
  await page.getByLabel("Nome da marca").fill(name);
  await page.getByLabel("O que você vende (nicho)").fill("Casa e decoração");
  await page.getByLabel("Cidade de onde você envia").fill("Cunha");
  await page.getByRole("button", { name: /Cadastrar marca|Salvar dados/ }).click();
}

test.afterAll(async () => {
  for (const email of emails) {
    const [account] = await database
      .select({ organizationId: member.organizationId })
      .from(user)
      .innerJoin(member, eq(member.userId, user.id))
      .where(eq(user.email, email));
    if (account !== undefined) {
      await database.delete(suppliers).where(eq(suppliers.organizationId, account.organizationId));
    }
    await database.delete(user).where(eq(user.email, email));
  }
  await database.$client.end();
});

test("a supplier cannot put a phone in the brand, a product or a spreadsheet row", async ({
  page,
}) => {
  await page.setViewportSize({ width: Number(process.env.EVIDENCE_WIDTH ?? 390), height: 844 });
  const email = await signUpAsSupplier(page, "Olaria Contato");
  emails.push(email);

  // The brand name, on the form.
  await registerBrand(page, "Olaria WhatsApp 11 98765-4321");
  await expect(page.getByText(SUPPLIER_TEXT_CONTACT_REFUSED).first()).toBeVisible();
  await shot(page, "marca");
  expect(await brandNameOf(email)).toBeNull();

  // Past the form: the request is changed on its way out and the server refuses it.
  await page.route(
    (url) => url.pathname.includes("_serverFn"),
    async (route) => {
      const body = route.request().postData() ?? "";
      await route.continue({ postData: body.replace("Olaria Segura", "Olaria zap 11 98765-4321") });
    },
  );
  await registerBrand(page, "Olaria Segura");
  await expect(page.getByText(SUPPLIER_TEXT_CONTACT_REFUSED).first()).toBeVisible();
  expect(await brandNameOf(email)).toBeNull();
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await registerBrand(page, "Olaria Segura");
  await expect(page).toHaveURL(/\/fornecedor\/painel\/produtos/);
  expect(await brandNameOf(email)).toBe("Olaria Segura");

  // A product description.
  await gotoHydrated(page, "/fornecedor/painel/produtos?product=novo");
  await page.getByRole("button", { name: /2\..*Dados obrigatórios/ }).click();
  await page.getByLabel("Código", { exact: true }).fill(`VASO-${Date.now()}`);
  await page.getByLabel("Título", { exact: true }).fill("Vaso de cerâmica");
  await page
    .getByLabel("Descrição", { exact: true })
    .fill("Encomendas: chama no zap 11 98765-4321");
  await expect(page.getByText(SUPPLIER_TEXT_CONTACT_REFUSED).first()).toBeVisible();
  await shot(page, "produto");

  // A spreadsheet: the row with a contact is refused, the other one is ready to import.
  await gotoHydrated(page, "/fornecedor/painel/importar");
  const csv = [
    "sku;titulo;descricao;custo;estoque",
    "VASO-1;Vaso pintado;Pintado à mão;20,00;5",
    "VASO-2;Vaso liso;WhatsApp para atacado 11 98765-4321;20,00;5",
  ].join("\r\n");
  await page.locator('input[type="file"]').setInputFiles({
    name: "produtos.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  await expect(page.getByRole("heading", { name: "1 válida, 1 com erro" })).toBeVisible();
  await expect(
    page.getByText("Tem telefone, e-mail ou rede social").filter({ visible: true }).first(),
  ).toBeVisible();
  await shot(page, "planilha");
});
