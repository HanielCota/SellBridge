import { expect, test, type Locator } from "@playwright/test";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";

type Box = NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;

function intersects(first: Box, second: Box): boolean {
  const horizontally = first.x < second.x + second.width && second.x < first.x + first.width;
  const vertically = first.y < second.y + second.height && second.y < first.y + first.height;
  return horizontally && vertically;
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("Element has no layout box on the page");
  }
  return box;
}

/*
 * Regression: on a 375 px phone the "Aguardando pagamento" badge of a statement line could not
 * shrink, ran past its column and was drawn over "não conta como venda" on the right.
 */
test("no celular, a etapa do pedido no extrato não cobre o valor da linha", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/financeiro");

  const row = page
    .getByRole("button")
    .filter({ hasText: "Aguardando pagamento" })
    .filter({ hasText: "não conta como venda" })
    .first();
  await row.scrollIntoViewIfNeeded();

  const status = await boxOf(row.getByText("Aguardando pagamento").filter({ visible: true }));
  const note = await boxOf(row.getByText("não conta como venda").filter({ visible: true }));
  expect(intersects(status, note)).toBe(false);
});
