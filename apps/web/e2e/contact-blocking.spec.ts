import { randomUUID } from "node:crypto";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { createDatabase } from "@sellbridge/database/client";
import {
  adminAuditEvents,
  member,
  orderItems,
  orderShipments,
  orders,
  shipmentEvents,
  organization,
  storeConnections,
  supplierProducts,
  suppliers,
  user,
} from "@sellbridge/database/schema";
import { CONTACT_DETAILS_REFUSED } from "@sellbridge/shared/schemas";
import { and, eq, gt, ilike, inArray, sql } from "drizzle-orm";
import { requireEnvironmentVariable } from "./environment";
import { DEMO_USER, gotoHydrated, SIGN_UP_PASSWORD, signIn, signUpAsSupplier } from "./helpers";

/*
 * The user's rule: reseller and supplier never get each other's phone, e-mail or social network.
 * The instructions, the occurrences and the tracking fields refuse them on the form and on the
 * server, also when the request is changed on its way past the form, and the try is audited.
 */
const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));
const stamp = randomUUID().slice(0, 8);
const externalOrderId = `E2E-CONTATO-${stamp}`;
/** Set to save the screenshots for the report; the widths then follow the report's. */
const evidenceDirectory = process.env.EVIDENCE_DIR;
// ASCII only: the request body escapes accents, and the tampering looks for this exact text.
const SAFE_NOTE = `Embalar com cuidado ${stamp}`;
let supplierEmail = "";
let supplierId = "";
let orderId = "";
let demoUserId = "";
const startedAt = new Date();

async function shot(page: Page, name: string) {
  if (evidenceDirectory === undefined) {
    return;
  }
  const width = page.viewportSize()?.width ?? 0;
  await page.screenshot({
    path: path.join(evidenceDirectory, `${name}-${width}.png`),
    fullPage: true,
  });
}

async function supplierOfPanelAccount(page: Page): Promise<string> {
  supplierEmail = await signUpAsSupplier(page, `Fornecedor Contato ${stamp}`);
  const [account] = await database
    .select({ organizationId: member.organizationId })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(eq(user.email, supplierEmail));
  if (account === undefined) throw new Error("fornecedor sem perfil");
  const [supplier] = await database
    .insert(suppliers)
    .values({
      name: `Fornecedor Contato ${stamp}`,
      niche: "Casa",
      state: "SP",
      city: "São Paulo",
      organizationId: account.organizationId,
    })
    .returning();
  if (supplier === undefined) throw new Error("fornecedor não criado");
  return supplier.id;
}

async function paidOrderOfDemoSeller(): Promise<string> {
  const [tenant] = await database
    .select()
    .from(organization)
    .where(eq(organization.slug, "ana-revendedora-demo"));
  if (tenant === undefined) throw new Error("Seed demo missing");
  const [store] = await database
    .select()
    .from(storeConnections)
    .where(eq(storeConnections.tenantId, tenant.id));
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: `CONTATO-${stamp}`,
      title: `Luminária contato ${stamp}`,
      costCents: 2000,
      suggestedPriceCents: 4990,
      stock: 5,
    })
    .returning();
  if (store === undefined || product === undefined) throw new Error("Seed catalog missing");
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: tenant.id,
      storeConnectionId: store.id,
      externalOrderId,
      status: "paid",
      totalCents: 4990,
      buyerName: "Maria Teste",
      orderedAt: new Date(),
    })
    .returning();
  if (order === undefined) throw new Error("Order missing");
  await database.insert(orderItems).values({
    tenantId: tenant.id,
    orderId: order.id,
    supplierProductId: product.id,
    title: product.title,
    quantity: 1,
    unitPriceCents: 4990,
    unitCostCents: product.costCents,
  });
  return order.id;
}

/** A request changed after the form checked it: the server must refuse it on its own. */
async function tamperNextPost(page: Page, from: string, to: string) {
  let tampered = false;
  await page.route(
    (url) => url.pathname.includes("_serverFn"),
    async (route) => {
      const body = route.request().postData();
      if (
        tampered ||
        route.request().method() !== "POST" ||
        body === null ||
        !body.includes(from)
      ) {
        await route.continue();
        return;
      }
      tampered = true;
      await route.continue({ postData: body.replace(from, to) });
    },
  );
}

async function openForwardDialog(page: Page) {
  await gotoHydrated(page, "/pedidos");
  await page.getByLabel("Buscar por pedido ou comprador").fill(externalOrderId);
  await expect(page.getByRole("button", { name: "Operar pedido" })).toHaveCount(1);
  await page.getByRole("button", { name: "Operar pedido" }).click();
  const dialog = page.getByRole("dialog", { name: "Operar pedido" });
  for (const [label, value] of Object.entries({
    Destinatário: "Maria Teste",
    Rua: "Rua das Flores",
    Número: "10",
    Bairro: "Centro",
    Cidade: "São Paulo",
    UF: "SP",
    CEP: "01001-000",
  }))
    await dialog.getByLabel(label, { exact: true }).fill(value);
  return dialog;
}

async function shipmentCount(): Promise<number> {
  return database.$count(orderShipments, eq(orderShipments.orderId, orderId));
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  supplierId = await supplierOfPanelAccount(page);
  await page.close();
  orderId = await paidOrderOfDemoSeller();
  const [demo] = await database.select().from(user).where(eq(user.email, DEMO_USER.email));
  demoUserId = demo?.id ?? "";
});

test.afterAll(async () => {
  if (orderId) await database.delete(orders).where(eq(orders.id, orderId));
  if (supplierId) await database.delete(suppliers).where(eq(suppliers.id, supplierId));
  if (supplierEmail) await database.delete(user).where(eq(user.email, supplierEmail));
  await database.$client.end();
});

/** Shipment history notes of the test order holding `text`: none may be saved when refused. */
async function savedNotesWith(text: string): Promise<number> {
  return database.$count(
    shipmentEvents,
    and(
      inArray(
        shipmentEvents.shipmentId,
        database
          .select({ id: orderShipments.id })
          .from(orderShipments)
          .where(eq(orderShipments.orderId, orderId)),
      ),
      ilike(shipmentEvents.note, `%${text}%`),
    ),
  );
}

// The second test reads the shipment the first one forwards.
test.describe.configure({ mode: "serial" });

test("a phone in the instructions is refused on the form and on the server, then the order goes", async ({
  page,
}) => {
  await page.setViewportSize({ width: evidenceDirectory ? 375 : 390, height: 844 });
  await signIn(page, DEMO_USER);
  const dialog = await openForwardDialog(page);
  const instructions = dialog.getByRole("textbox", { name: /^Instruções para o fornecedor/ });
  const send = dialog.getByRole("button", { name: "Criar ordens e encaminhar aos fornecedores" });

  // Said when leaving the field, and sending does nothing while the phone is there.
  await instructions.fill("Qualquer coisa me chama no (11) 98765-4321");
  await instructions.blur();
  await expect(dialog.getByText(CONTACT_DETAILS_REFUSED)).toBeVisible();
  await shot(page, "revendedor-operar-pedido-instrucoes");
  await send.click();
  await expect(dialog.getByLabel("Link do fornecedor")).toHaveCount(0);
  expect(await shipmentCount()).toBe(0);

  // The form is happy; the request is changed on its way out.
  await instructions.fill(SAFE_NOTE);
  await tamperNextPost(page, SAFE_NOTE, "zap onze nove oito sete seis cinco quatro tres dois um");
  await send.click();
  await expect(page.getByText(CONTACT_DETAILS_REFUSED)).toBeVisible();
  await shot(page, "revendedor-aviso-bloqueio");
  expect(await shipmentCount()).toBe(0);
  const audited = await database.$count(
    adminAuditEvents,
    and(
      eq(adminAuditEvents.userId, demoUserId),
      eq(adminAuditEvents.action, "contact_blocked"),
      // One entry per person and field every ten minutes: an earlier run may hold this one.
      gt(adminAuditEvents.createdAt, new Date(startedAt.getTime() - 10 * 60_000)),
      sql`${adminAuditEvents.details}->>'field' = 'notes'`,
    ),
  );
  expect(audited).toBeGreaterThan(0);

  await send.click();
  await expect(dialog.getByLabel("Link do fornecedor")).toBeVisible();
  expect(await shipmentCount()).toBe(1);
});

test("the supplier cannot send a contact back, by the link or by the panel", async ({
  browser,
  page,
}) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/pedidos");
  await page.getByLabel("Buscar por pedido ou comprador").fill(externalOrderId);
  await expect(page.getByRole("button", { name: "Operar pedido" })).toHaveCount(1);
  await page.getByRole("button", { name: "Operar pedido" }).click();
  const dialog = page.getByRole("dialog", { name: "Operar pedido" });
  await dialog
    .getByRole("button", { name: /Gerar novo link/ })
    .first()
    .click();
  const supplierUrl = await dialog.getByLabel("Link do fornecedor").inputValue();

  const linkContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const linkPage = await linkContext.newPage();
  await gotoHydrated(linkPage, supplierUrl);
  const occurrence = linkPage.getByRole("textbox", { name: /^Ocorrência ou observação/ });
  await occurrence.fill("Me manda um e-mail: fornecedor arroba gmail ponto com");
  await linkPage.getByRole("button", { name: "Registrar ocorrência" }).click();
  await expect(linkPage.getByText(CONTACT_DETAILS_REFUSED)).toBeVisible();
  await shot(linkPage, "fornecedor-link-ocorrencia");
  await occurrence.fill(SAFE_NOTE);
  await tamperNextPost(linkPage, SAFE_NOTE, "insta: fornecedor.oficial");
  await linkPage.getByRole("button", { name: "Registrar ocorrência" }).click();
  await expect(linkPage.getByText(CONTACT_DETAILS_REFUSED)).toBeVisible();
  expect(await savedNotesWith("fornecedor.oficial")).toBe(0);
  await linkContext.close();

  const panelContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const panel = await panelContext.newPage();
  await signIn(panel, { email: supplierEmail, password: SIGN_UP_PASSWORD });
  await gotoHydrated(panel, `/fornecedor/painel/pedidos?query=${externalOrderId}`);
  await panel
    .getByRole("button", { name: `Pedido ${externalOrderId}` })
    .first()
    .click();
  const panelNote = panel.getByRole("textbox", { name: /^Ocorrência ou observação/ });
  await panelNote.fill("tiktok: @fornecedor_oficial");
  await panelNote.blur();
  await expect(panel.getByText(CONTACT_DETAILS_REFUSED)).toBeVisible();
  await shot(panel, "fornecedor-painel-ocorrencia");
  await panelNote.fill(SAFE_NOTE);
  await tamperNextPost(panel, SAFE_NOTE, "tiktok: @fornecedor_oficial");
  await panel.getByRole("button", { name: "Registrar ocorrência" }).click();
  await expect(panel.getByText(CONTACT_DETAILS_REFUSED)).toBeVisible();
  expect(await savedNotesWith("fornecedor_oficial")).toBe(0);
  await panelContext.close();
});
