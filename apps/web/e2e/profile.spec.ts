import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { gotoHydrated, signUp } from "./helpers";

const AVATAR_FIXTURE = fileURLToPath(new URL("./fixtures/avatar.png", import.meta.url));

test("adiciona, mostra e remove a foto de perfil", async ({ page }) => {
  await signUp(page, "Revendedor Com Foto");
  // Sign-up ends on the region step; let that navigation finish before leaving.
  await expect(page).toHaveURL(/\/onboarding/);
  await gotoHydrated(page, "/perfil");
  await expect(page.getByRole("heading", { name: "Meu perfil" })).toBeVisible();

  await page.getByLabel("Escolher foto de perfil").setInputFiles(AVATAR_FIXTURE);
  await expect(page.getByText("Foto de perfil atualizada")).toBeVisible();

  const headerPhoto = page.getByRole("banner").locator("img[src^='/api/perfil/foto/']");
  await expect(headerPhoto).toBeVisible();
  const source = await headerPhoto.getAttribute("src");
  const photo = await page.request.get(source ?? "");
  expect(photo.status()).toBe(200);
  expect(photo.headers()["content-type"]).toBe("image/webp");

  await page.getByRole("button", { name: "Remover" }).click();
  await expect(page.getByText("Foto de perfil removida")).toBeVisible();
  await expect(page.getByRole("banner").locator("img[src^='/api/perfil/foto/']")).toHaveCount(0);
  expect((await page.request.get(source ?? "")).status()).toBe(404);
});

test("recusa arquivo que não é imagem e esconde fotos de quem não está logado", async ({
  page,
  playwright,
}) => {
  await signUp(page, "Revendedor Foto Falsa");
  const fakeImage = await page.request.post("/api/perfil/foto", {
    multipart: {
      file: {
        name: "foto.png",
        mimeType: "image/png",
        buffer: Buffer.from("%PDF-1.7 not an image"),
      },
    },
  });
  expect(fakeImage.status()).toBe(400);
  expect(await fakeImage.json()).toEqual({ error: "Envie uma imagem PNG, JPG ou WEBP" });

  const anonymous = await playwright.request.newContext({ baseURL: "http://localhost:3100" });
  const response = await anonymous.get(
    "/api/perfil/foto/someone/00000000-0000-0000-0000-000000000000.webp",
  );
  expect(response.status()).toBe(401);
  await anonymous.dispose();
});

test("o avatar do topo abre o modal para enviar a foto", async ({ page }) => {
  await signUp(page, "Revendedor Modal Foto");
  await expect(page).toHaveURL(/\/onboarding/);
  await gotoHydrated(page, "/onboarding");
  await page.getByRole("button", { name: "Adicionar foto de perfil" }).click();
  const dialog = page.getByRole("dialog", { name: "Foto de perfil" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Escolher foto de perfil").setInputFiles(AVATAR_FIXTURE);
  await expect(page.getByText("Foto de perfil atualizada")).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("banner").locator("img[src^='/api/perfil/foto/']")).toBeVisible();
  await expect(page.getByRole("button", { name: "Trocar foto de perfil" })).toBeVisible();
});
