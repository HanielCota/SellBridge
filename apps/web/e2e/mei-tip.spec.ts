import { expect, test } from "@playwright/test";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";

// Decision of 18/11/2026 ("Vamos de A"): a CPF seller keeps selling; the panel only suggests an MEI.
test("who sells with a CPF sees the MEI suggestion, without anything blocked", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/dashboard");
  await expect(page.getByText("Se você vende com frequência, abra um MEI.")).toBeVisible();

  await page.getByRole("link", { name: "Cadastrar CNPJ" }).click();

  await expect(page).toHaveURL(/step=details/);
  await expect(page.getByText("Se você vende com frequência, abra um MEI.")).toBeVisible();
  await page.getByLabel("Vendo como empresa (CNPJ)").check();
  await expect(page.getByText("Se você vende com frequência, abra um MEI.")).toHaveCount(0);
});
