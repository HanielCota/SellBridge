import { expect, test } from "@playwright/test";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";

// Regression: the stage filter of the operations tab offered "Paid orders to prepare" in English.
test("o filtro de etapa da operação fala português", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/pedidos?view=operations&stage=unforwarded");
  await expect(page.getByRole("combobox", { name: "Etapa operacional" })).toHaveText(
    "Pagos a encaminhar",
  );
});
