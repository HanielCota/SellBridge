import { expect, test } from "@playwright/test";
import {
  completeOnboarding,
  fillBillingHolder,
  gotoHydrated,
  pickSupplier,
  signUp,
} from "./helpers";

test("completed details remain editable while supplier setup is unfinished", async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page, "Editable Setup Customer");
  await fillBillingHolder(page);
  await expect(page.getByText("Etapa 2 de 2 · Seu fornecedor")).toBeVisible();
  await gotoHydrated(page, "/dashboard");
  await page.getByRole("link", { name: "Edit details", exact: true }).click();
  await expect(page).toHaveURL(/step=details/);
  const name = page.getByLabel("Nome completo", { exact: true });
  const original = await name.inputValue();
  await name.fill("Unsaved Customer Name");
  const beforeUnload = page.waitForEvent("dialog");
  await page.close({ runBeforeUnload: true });
  const closeWarning = await beforeUnload;
  expect(closeWarning.type()).toBe("beforeunload");
  await closeWarning.dismiss();
  await expect(name).toHaveValue("Unsaved Customer Name");

  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("link", { name: "Back to setup" }).click();
  await expect(page).toHaveURL(/step=details/);
  await expect(name).toHaveValue("Unsaved Customer Name");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("link", { name: "Back to setup" }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
  await page.getByRole("link", { name: "Edit details", exact: true }).click();
  await expect(name).toHaveValue(original);

  await name.fill("Saved Customer Name");
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(page.getByRole("button", { name: "Details saved", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Back to setup" }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
  await page.getByRole("link", { name: "Edit details", exact: true }).click();
  await expect(name).toHaveValue("Saved Customer Name");
  await gotoHydrated(page, "/onboarding");
  await expect(page.getByText("Etapa 2 de 2 · Seu fornecedor")).toBeVisible();
});

test("supplier edits can be cancelled and saved without resetting completed details", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signUp(page, "Supplier Setup Customer");
  await completeOnboarding(page);
  await expect(page).toHaveURL(/\/lojas(?:\?|$)/);
  await gotoHydrated(page, "/dashboard");
  await page.getByRole("link", { name: "Change supplier", exact: true }).click();
  await expect(page).toHaveURL(/step=supplier/);
  const selected = page.getByRole("radio", { name: /BH Beauty Distribuidora/ });
  await expect(selected).toBeChecked();
  const otherName = await page
    .locator("label")
    .filter({ has: page.getByRole("radio") })
    .filter({ hasNotText: "BH Beauty Distribuidora" })
    .first()
    .locator(".block.font-semibold")
    .innerText();
  await pickSupplier(page, otherName);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("link", { name: "Back to setup" }).click();
  await expect(page).toHaveURL(/step=supplier/);
  await page.getByRole("button", { name: `Continuar com ${otherName}` }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
  await page.getByRole("link", { name: "Change supplier", exact: true }).click();
  await expect(page.getByRole("radio", { name: new RegExp(otherName) })).toBeChecked();
  await gotoHydrated(page, "/onboarding?step=details");
  await expect(page.getByLabel("Nome completo", { exact: true })).not.toHaveValue("");
});
